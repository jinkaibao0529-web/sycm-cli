from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FIELDS = {
    'rank': ('排名', ('rank', 'rankNum', 'ranking', 'order', 'cateRankId')),
    'rank_change': ('排名变化', ('rankChange', 'rankChangeValue', 'rankDiff', 'rankRise', 'cateRankId.cycleCqc')),
    'item_id': ('商品ID', ('itemId', 'productId', 'item_id', 'auctionId', 'item.id', 'item.itemId')),
    'title': ('商品名称', ('itemTitle', 'itemName', 'title', 'productName', 'item.title', 'item.name')),
    'keywords': ('商品关键词', ('keywords', 'keyword', 'itemKeywords', 'coreKeyword', 'coreKeyWord', 'wordList')),
    'shop_name': ('店铺名称', ('shopName', 'shopTitle', 'sellerNick', 'shop.name', 'shop.title')),
    'shop_type': ('店铺类型', ('shopType', 'shop.type')),
    'pay_buyers': ('支付买家数区间', ('payByrCnt', 'payBuyerCnt', 'payBuyerCount', 'payByrCntIndex')),
    'visitors': ('访客数区间', ('uv', 'uvIndex', 'itmUv', 'visitorCount', 'uvCnt')),
    'product_url': ('商品链接', ('itemUrl', 'detailUrl', 'productUrl', 'item.url', 'item.detailUrl')),
    'image_url': ('商品图片链接', ('picUrl', 'pictUrl', 'itemPicUrl', 'imageUrl', 'item.picUrl', 'item.pictUrl')),
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def root() -> Path:
    path = Path(os.environ.get('MARKET_STATE_DIR') or Path(os.environ.get('LOCALAPPDATA', Path.cwd())) / 'SycmMarket')
    path.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def connect():
    conn = sqlite3.connect(root() / 'market.db', timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    with connect() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, profile TEXT NOT NULL, pages INTEGER DEFAULT 0,
          total INTEGER, count INTEGER DEFAULT 0, message TEXT NOT NULL DEFAULT '',
          missing TEXT NOT NULL DEFAULT '[]', account_key TEXT
        );
        CREATE TABLE IF NOT EXISTS items (
          task_id TEXT NOT NULL, identity TEXT NOT NULL, position INTEGER NOT NULL,
          data TEXT NOT NULL, PRIMARY KEY(task_id, identity)
        );
        ''')


def recover():
    with connect() as c:
        c.execute("UPDATE tasks SET status='interrupted',message='本地服务已重启 已保留完成部分 请重新采集',updated_at=? WHERE status IN ('running','queued','cancelling')", (now(),))


def update_task(task_id: str, **values):
    allowed = {'status', 'pages', 'count', 'total', 'message', 'missing', 'account_key'}
    assert values.keys() <= allowed
    values['updated_at'] = now()
    with connect() as c:
        c.execute('UPDATE tasks SET ' + ','.join(k + '=?' for k in values) + ' WHERE id=?', (*values.values(), task_id))


def task_dict(row) -> dict:
    result = dict(row)
    result['profile'] = json.loads(result['profile'])
    result['profile'].pop('account_key', None)
    result['missing'] = json.loads(result['missing'])
    result.pop('account_key', None)
    return result


def get_task(task_id):
    with connect() as c:
        r = c.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
    return task_dict(r) if r else None


def at(obj: Any, path: str):
    for key in path.split('.'):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(key)
    return obj


def display(value):
    if value is None:
        return None
    if isinstance(value, dict):
        for key in ('value', 'range', 'text', 'name'):
            if value.get(key) is not None:
                return display(value[key])
        return None
    if isinstance(value, list):
        return ' / '.join(str(v) for x in value if (v := display(x)) is not None)
    if isinstance(value, bool):
        return str(value)
    return str(value)


def normalize(row: dict):
    result = {}
    for key, (_, aliases) in FIELDS.items():
        result[key] = next((v for p in aliases if (v := display(at(row, p))) not in (None, '')), None)
    b2c = at(row, 'shop.b2CShop')
    if result['shop_type'] is None and isinstance(b2c, bool):
        result['shop_type'] = '天猫' if b2c else '淘宝'
    for key in ('product_url', 'image_url'):
        value = result[key]
        if value and value.startswith('//'):
            value = 'https:' + value
        result[key] = value if value and value.startswith('https://') else None
    return result


def save_rows(task_id, rows, position):
    with connect() as c:
        for index, row in enumerate(rows):
            identity = row['item_id'] or row['product_url'] or f'unkeyed:{position + index}'
            c.execute('INSERT OR IGNORE INTO items VALUES (?,?,?,?)', (task_id, identity, position + index, json.dumps(row, ensure_ascii=False)))
        count = c.execute('SELECT count(*) FROM items WHERE task_id=?', (task_id,)).fetchone()[0]
    return count


def fingerprint(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
