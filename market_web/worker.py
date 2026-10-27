"""One isolated browser bridge per probe/task; JSON stdout is local IPC only."""
from __future__ import annotations

import hashlib
import json
import os
import random
import sys
import time

from .data import FIELDS, connect, fingerprint, get_task, init, normalize, root, save_rows, update_task


def emit(value):
    # ASCII IPC also works when a frozen Windows process ignores PYTHONUTF8.
    print(json.dumps(value, ensure_ascii=True), flush=True)


class MarketConnection:
    def __enter__(self):
        from tb.core.bridge import BridgeServer, BridgeSession, version_tuple
        from tb.platforms.sycm.platform import SYCM
        self.server = BridgeServer(SYCM)
        self.server.start()
        self.session = BridgeSession(self.server)
        if not self.server.extension_seen.wait(float(os.environ.get('MARKET_CONNECT_WAIT', '45'))):
            self.server.stop()
            raise RuntimeError('未连接取数桥 请打开 Chrome 并加载本工具附带的扩展')
        if version_tuple(self.server.extension_version) < version_tuple('1.0.0'):
            self.server.stop()
            raise RuntimeError('请刷新取数桥扩展 更新为本工具附带的 1.0.0 版')
        return self

    def ask(self, **market):
        result = self.server.submit({'market': market}, 45)
        self.session._check_who(result)
        if not (result.get('who') or {}).get('uid'):
            raise RuntimeError('浏览器尚未登录 请在生意参谋完成登录')
        if result.get('error'):
            raise RuntimeError(result['error'])
        self.account_key = hashlib.sha256(str(result['who']['uid']).encode()).hexdigest()
        return result['market']

    def __exit__(self, *_):
        self.server.stop()


def cancelled(task_id):
    return (root() / f'cancel-{task_id}').exists()


def collect(task_id):
    task = get_task(task_id)
    profile = task['profile']
    with connect() as c:
        stored = c.execute('SELECT profile FROM tasks WHERE id=?', (task_id,)).fetchone()
        profile_account = json.loads(stored[0]).get('account_key')
    update_task(task_id, status='running', message='正在连接浏览器')
    seen = set()
    position = 0
    nonempty = set()
    try:
        with MarketConnection() as conn:
            for page in range(1, 10001):
                if cancelled(task_id):
                    update_task(task_id, status='cancelled', message='已取消 已保留完成部分')
                    return
                if page > 1:
                    until = time.monotonic() + random.uniform(1.8, 3.5)
                    while time.monotonic() < until:
                        if cancelled(task_id):
                            update_task(task_id, status='cancelled', message='已取消 已保留完成部分')
                            return
                        time.sleep(.1)
                limit = os.environ.get('SYCM_REQUEST_LIMIT', '')
                if limit.isdigit() and page > int(limit):
                    raise RuntimeError('已达到配置的请求上限 已停止并保留完成部分')
                update_task(task_id, message=f'正在读取第 {page} 页')
                data = conn.ask(op='page', capture_id=profile['id'], page=page, signature=profile['signature'],
                                date_range=profile.get('request_date_range'))
                with connect() as c:
                    expected = c.execute('SELECT account_key FROM tasks WHERE id=?', (task_id,)).fetchone()[0]
                if profile_account != conn.account_key or (expected and expected != conn.account_key):
                    raise RuntimeError('账号发生变化 本次数据已作废 请重新识别页面')
                update_task(task_id, account_key=conn.account_key)
                raw = data['rows']
                if not isinstance(raw, list) or any(not isinstance(r, dict) for r in raw):
                    raise RuntimeError('榜单结构发生变化 请重新识别页面')
                rows = [normalize(r) for r in raw]
                if rows and not any(r['title'] or r['item_id'] for r in rows):
                    raise RuntimeError('未识别到商品字段 请检查接口适配')
                sig = fingerprint(raw)
                if raw and sig in seen:
                    raise RuntimeError('平台返回了重复页 已停止 请检查页面分页权限')
                seen.add(sig)
                for row in rows:
                    nonempty.update(k for k, v in row.items() if v not in (None, ''))
                count = save_rows(task_id, rows, position)
                position += len(rows)
                total = data.get('total')
                missing = [label for k, (label, _) in FIELDS.items() if k not in nonempty]
                update_task(task_id, pages=page, count=count, total=total,
                            missing=json.dumps(missing, ensure_ascii=False), message=f'已读取 {page} 页 共 {count} 件商品')
                if not raw or data.get('has_more') is False or (total is not None and position >= total):
                    if total is not None and count < total:
                        raise RuntimeError('返回条数少于榜单总数 已保留完成部分 请检查权限或重复商品')
                    update_task(task_id, status='completed', message='采集完成 数据已保存在本机')
                    return
                if not data.get('page_key'):
                    raise RuntimeError('未识别到分页参数 已保留当前页 请在原页面翻页后重新识别')
            raise RuntimeError('达到单任务页数保护上限 已保留完成部分')
    except Exception as error:
        # Account or plugin changes invalidate the whole task, not just the last page.
        from tb.core.errors import AccountChanged, PluginChanged
        if isinstance(error, (AccountChanged, PluginChanged)) or '账号发生变化' in str(error):
            with connect() as c:
                c.execute('DELETE FROM items WHERE task_id=?', (task_id,))
            update_task(task_id, count=0)
        update_task(task_id, status='cancelled' if cancelled(task_id) else 'failed', message=safe_error(error))
    finally:
        (root() / f'cancel-{task_id}').unlink(missing_ok=True)


def safe_error(error):
    # Do not leak upstream exception URLs, tokens or tracebacks to the UI.
    from tb.core.errors import AccountChanged, PluginChanged
    if isinstance(error, (AccountChanged, PluginChanged)):
        return '账号或浏览器实例发生变化 本次数据已作废 请重新识别页面'
    if isinstance(error, RuntimeError):
        msg = str(error)
        if 'http' not in msg.lower() and 'token' not in msg.lower() and len(msg) < 220:
            return msg
    return '浏览器取数失败 请检查登录 扩展版本与市场排行权限后重试'


def main():
    init()
    if sys.argv[1] == 'probe':
        try:
            with MarketConnection() as conn:
                data = conn.ask(op='inspect')
                for p in data.get('profiles', []):
                    p['account_key'] = conn.account_key
                emit({'ok': True, **data})
        except Exception as error:
            emit({'ok': False, 'message': safe_error(error), 'profiles': []})
        return
    collect(sys.argv[2])


if __name__ == '__main__':
    main()
