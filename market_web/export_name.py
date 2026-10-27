"""Download names derived solely from the saved task, never the active UI."""
from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

from .periods import LABELS, bounds, mode_of


def download_names(task):
    profile = task.get('profile') or {}
    period = profile.get('period') or {}
    mode = period.get('mode') or mode_of(profile)
    identity = task['id']
    chinese = f'市场商品榜_日期未识别_{identity}'
    english = f'market_unknown_{identity}'
    try:
        if period.get('start_date') and period.get('end_date'):
            start, end = date.fromisoformat(period['start_date']), date.fromisoformat(period['end_date'])
        else:
            saved = dict(profile)
            saved['params'] = dict(profile.get('params') or {})
            if profile.get('request_date_range'):
                saved['params']['dateRange'] = profile['request_date_range']
            start, end = bounds(saved)
        if end < start or mode not in LABELS:
            raise ValueError()
        stamp = f'{start.isoformat()}_{end.isoformat()}'
        if mode == 'realtime':
            created = datetime.fromisoformat(task['created_at'].replace('Z', '+00:00'))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            stamp = created.astimezone(timezone(timedelta(hours=8))).strftime('%Y-%m-%d_%H%M%S')
        elif mode == 'day':
            stamp = start.isoformat()
        elif mode == 'month':
            stamp = start.strftime('%Y-%m')
        chinese = f'市场商品榜_{LABELS[mode]}_{stamp}'
        english = f'market_{mode}_{stamp}'
    except (KeyError, TypeError, ValueError, AttributeError):
        pass
    if task['status'] in {'cancelled', 'failed', 'interrupted'}:
        chinese += '_部分结果'
        english += '_partial'
    return chinese + '.xlsx', english + '.xlsx'


def content_disposition(task):
    chinese, english = download_names(task)
    return f'attachment; filename="{english}"; filename*=UTF-8\'\'{quote(chinese, safe="")}'
