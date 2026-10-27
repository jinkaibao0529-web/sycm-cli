from __future__ import annotations

import asyncio
import io
import json
import os
import secrets
import subprocess
import sys
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .data import FIELDS, connect, get_task, init, now, recover, root, task_dict, update_task

PROJECT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
FRONTEND = PROJECT / 'frontend' / 'dist'
EXTENSION = (Path(sys.executable).parent / 'extension' / 'unpacked') if getattr(sys, 'frozen', False) else PROJECT / 'extension' / 'unpacked'
ACTIVE = {'queued', 'running', 'cancelling'}


def worker_command(*args):
    if getattr(sys, 'frozen', False):
        return [sys.executable, '--worker', *args]
    return [sys.executable, '-m', 'market_web.worker', *args]


class TaskInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    profile_id: str = Field(min_length=1, max_length=100)


class Coordinator:
    def __init__(self):
        self.lock = threading.Lock()
        self.connection = {'ok': False, 'status': 'idle', 'message': '尚未检查浏览器连接', 'profiles': []}
        self.profiles = {}
        self.process = None
        self.probing = False

    def is_active(self):
        return self.process is not None and self.process.poll() is None

    def launch_probe(self):
        with self.lock:
            if self.is_active() or self.probing:
                raise HTTPException(409, '正在读取浏览器 请等待当前操作完成')
            self.probing = True
            self.profiles = {}
            self.connection = {'ok': False, 'status': 'checking', 'message': '正在等待浏览器取数桥', 'profiles': []}
        threading.Thread(target=self._probe, daemon=True).start()

    def _probe(self):
        try:
            result = subprocess.run(worker_command('probe'), cwd=PROJECT, env={**os.environ, 'PYTHONUTF8': '1'},
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8', timeout=105,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            lines = [s for s in result.stdout.splitlines() if s.startswith('{')]
            data = json.loads(lines[-1]) if lines else {'ok': False, 'message': '连接检查未完成 请重试', 'profiles': []}
            with self.lock:
                self.profiles = {p['id']: p for p in data.get('profiles', [])}
                visible = [{k: v for k, v in p.items() if k != 'account_key'} for p in data.get('profiles', [])]
                self.connection = {**data, 'profiles': visible, 'status': 'ready' if self.profiles else 'connected' if data.get('ok') else 'offline'}
        except Exception:
            with self.lock:
                self.connection = {'ok': False, 'status': 'offline', 'message': '连接超时 请检查 Chrome 与取数桥扩展', 'profiles': []}
        finally:
            self.probing = False

    def create(self, profile_id):
        with self.lock:
            if self.is_active() or self.probing:
                raise HTTPException(409, '已有任务正在执行')
            profile = self.profiles.get(profile_id)
            if not profile:
                raise HTTPException(422, '来源尚未识别 请先检查浏览器连接')
            task_id = uuid.uuid4().hex
            with connect() as c:
                c.execute('INSERT INTO tasks(id,status,created_at,updated_at,profile,total) VALUES (?,?,?,?,?,?)',
                          (task_id, 'queued', now(), now(), json.dumps(profile, ensure_ascii=False), profile.get('total')))
            try:
                self.process = subprocess.Popen(worker_command('collect', task_id), cwd=PROJECT, env={**os.environ, 'PYTHONUTF8': '1'},
                                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            except Exception:
                update_task(task_id, status='failed', message='采集进程未能启动 请重新启动工具')
                raise HTTPException(503, '无法启动采集进程')
            threading.Thread(target=self._watch, args=(self.process, task_id), daemon=True).start()
            return get_task(task_id)

    def _watch(self, process, task_id):
        process.wait()
        if (get_task(task_id) or {}).get('status') in ACTIVE:
            update_task(task_id, status='interrupted', message='采集进程已退出 已保留完成部分')

    def shutdown(self):
        if self.is_active():
            self.process.terminate()
            self.process.wait(timeout=10)


def create_app():
    coordinator = Coordinator()
    csrf = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(_):
        init()
        recover()
        yield
        coordinator.shutdown()

    app = FastAPI(title='市场商品榜', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.coordinator = coordinator

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        host = request.url.hostname
        if host not in {'127.0.0.1', 'localhost', 'testserver'}:
            return JSONResponse({'detail': '仅允许本机访问'}, status_code=403)
        if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            origin = request.headers.get('origin')
            if origin and origin != str(request.base_url).rstrip('/'):
                return JSONResponse({'detail': '仅允许本地页面操作'}, status_code=403)
            if request.headers.get('x-market-token') != csrf:
                return JSONResponse({'detail': '页面会话已更新 请刷新后重试'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        response.headers['Cache-Control'] = 'no-store' if request.url.path.startswith('/api/') else 'no-cache'
        return response

    @app.get('/api/session')
    def session():
        return {'token': csrf, 'version': '0.1.0', 'local_only': True}

    @app.get('/api/health')
    def health():
        return {'ok': True, 'app': 'sycm-market-local'}

    @app.get('/api/connection')
    def connection():
        return coordinator.connection

    @app.post('/api/connection/check', status_code=202)
    def check():
        coordinator.launch_probe()
        return coordinator.connection

    @app.get('/api/setup')
    def setup():
        return {'extension_path': str(EXTENSION), 'extension_version': '0.9.0',
                'platform_url': 'https://sycm.taobao.com/', 'steps': [
                    '在 Chrome 扩展程序页开启开发者模式', '加载本工具附带的 extension/unpacked 文件夹',
                    '登录生意参谋 打开市场排行的商品页', '刷新页面并翻页一次 然后点击识别榜单']}

    @app.get('/api/tasks')
    def tasks():
        with connect() as c:
            rows = c.execute('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100').fetchall()
        return {'tasks': [task_dict(r) for r in rows]}

    @app.post('/api/tasks', status_code=201)
    def create_task(data: TaskInput):
        return coordinator.create(data.profile_id)

    @app.get('/api/tasks/{task_id}')
    def task(task_id: str):
        return require_task(task_id)

    @app.post('/api/tasks/{task_id}/cancel')
    def cancel(task_id: str):
        t = require_task(task_id)
        if t['status'] in ACTIVE:
            (root() / f'cancel-{task_id}').touch()
            update_task(task_id, status='cancelling', message='正在停止当前请求 已完成数据会保留')
        return require_task(task_id)

    @app.get('/api/tasks/{task_id}/items')
    def items(task_id: str, page: int = 1, page_size: int = 20, q: str = ''):
        t = require_task(task_id)
        if page < 1 or not 1 <= page_size <= 100 or len(q) > 100:
            raise HTTPException(422, '分页或搜索条件无效')
        with connect() as c:
            where, args = 'task_id=?', [task_id]
            if q:
                where += " AND instr(lower(data), lower(?))>0"
                args.append(q)
            total = c.execute('SELECT count(*) FROM items WHERE ' + where, args).fetchone()[0]
            rows = c.execute('SELECT data FROM items WHERE ' + where + ' ORDER BY position LIMIT ? OFFSET ?', (*args, page_size, (page-1)*page_size)).fetchall()
        return {'items': [json.loads(r[0]) for r in rows], 'total': total, 'page': page, 'page_size': page_size, 'status': t['status']}

    @app.get('/api/tasks/{task_id}/export')
    def export(task_id: str):
        t = require_task(task_id)
        if not t['count'] or t['status'] in ACTIVE:
            raise HTTPException(409, '任务结束且有商品数据后即可导出')
        from .xlsx import workbook
        content = workbook(t)
        name = f'market_{t["created_at"][:10]}_{task_id[:6]}.xlsx'
        return StreamingResponse(io.BytesIO(content), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                 headers={'Content-Disposition': f'attachment; filename="{name}"'})

    if (FRONTEND / 'assets').exists():
        app.mount('/assets', StaticFiles(directory=FRONTEND / 'assets'), name='assets')

    @app.get('/')
    def index():
        if not (FRONTEND / 'index.html').exists():
            return JSONResponse({'detail': '前端尚未构建 请运行 npm run build'}, status_code=503)
        return FileResponse(FRONTEND / 'index.html')

    return app


def require_task(task_id):
    if len(task_id) != 32 or any(c not in '0123456789abcdef' for c in task_id):
        raise HTTPException(404, '任务不存在')
    t = get_task(task_id)
    if not t:
        raise HTTPException(404, '任务不存在')
    return t
