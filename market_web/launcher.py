from __future__ import annotations

import multiprocessing
import os
import sys
import threading
import time
import urllib.request
import webbrowser


def main():
    multiprocessing.freeze_support()
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    if '--worker' in sys.argv:
        from market_web.worker import main as worker
        sys.argv = ['market-worker', *sys.argv[sys.argv.index('--worker') + 1:]]
        worker()
        return
    import uvicorn
    from market_web.app import create_app
    port = int(os.environ.get('MARKET_PORT', '8765'))
    url = f'http://127.0.0.1:{port}'
    try:
        import json
        with urllib.request.urlopen(url + '/api/health', timeout=1) as res:
            existing = json.load(res)
        if existing.get('app') == 'sycm-market-local':
            if '--no-browser' not in sys.argv:
                webbrowser.open(url)
            return
    except (OSError, ValueError):
        pass
    print('Market workbench: ' + url, flush=True)
    print('Keep this window open. Close it to stop the local service.', flush=True)
    if '--no-browser' not in sys.argv:
        def open_when_ready():
            for _ in range(60):
                try:
                    with urllib.request.urlopen(url + '/api/health', timeout=1) as res:
                        if res.status == 200:
                            webbrowser.open(url)
                            return
                except OSError:
                    time.sleep(.25)
        threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run(create_app(), host='127.0.0.1', port=int(os.environ.get('MARKET_PORT', port)), log_level='warning')


if __name__ == '__main__':
    main()
