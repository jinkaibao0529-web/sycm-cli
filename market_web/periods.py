"""Time selection from observed platform requests, never from guessed endpoints."""
from __future__ import annotations

import calendar
import copy
import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone

LABELS = {'realtime': '实时', 'recent7': '7天', 'recent30': '30天', 'day': '日', 'week': '周', 'month': '月'}
TYPES = {'today': 'realtime', **{x: x for x in LABELS if x != 'realtime'}}
TRANSPORT = {'dateType', 'dateRange', 'startDate', 'endDate', 'date', 'statDate', 'page', 'pageNo', 'pageNum', 'currentPage', 'pageIndex', 'pageSize', '_', 't', 'callback', 'spm'}


def source_filters(profile):
    return {k: str(v) for k, v in sorted(profile.get('params', {}).items())
            if k not in TRANSPORT and v not in ('', None) and not re.search(r'token|cookie|session|csrf|secret|password|sign', k, re.I)}


def source_groups(profiles):
    """Stable business sources, separate from per-period request templates."""
    groups = {}
    for profile in sorted(profiles, key=lambda p: p.get('captured_at', '')):
        payload = json.dumps({'account': profile.get('account_key'), 'filters': source_filters(profile)}, sort_keys=True)
        key = 'source_' + hashlib.sha256(payload.encode()).hexdigest()[:24]
        groups[key] = profile
    return groups


def china_today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def mode_of(profile):
    return TYPES.get(profile.get('params', {}).get('dateType', ''))


def bounds(profile):
    try:
        left, right = profile['params']['dateRange'].split('|')
        start, end = date.fromisoformat(left), date.fromisoformat(right)
        if end < start:
            raise ValueError()
        return start, end
    except (KeyError, TypeError, ValueError):
        raise ValueError('来源统计区间未识别 请重新识别对应时间入口') from None


def same_filters(a, b):
    return source_filters(a) == source_filters(b)


def matching(profiles, base, mode):
    found = []
    for p in profiles:
        if mode_of(p) == mode and same_filters(p, base) and p.get('account_key') == base.get('account_key'):
            try:
                bounds(p)
                found.append(p)
            except ValueError:
                pass
    return sorted(found, key=lambda p: (bounds(p)[1], p.get('captured_at', '')))


def explicit_limits(options):
    """Only adapter-attested platform limits count; observed dates never do."""
    lows, highs = [], []
    for p in options:
        limits = p.get('query_limits') or {}
        if limits.get('basis') != 'platform_explicit':
            continue
        for key, target in (('earliest_date', lows), ('latest_date', highs)):
            if limits.get(key):
                try:
                    target.append(date.fromisoformat(limits[key]))
                except (TypeError, ValueError):
                    pass
    return max(lows) if lows else None, min(highs) if highs else None


def latest_complete(mode, sample, today):
    if mode == 'day':
        end = today - timedelta(days=1)
        return end, end
    if mode == 'week':
        start, end = bounds(sample)
        if (end - start).days != 6:
            raise ValueError('平台周统计范围尚未完整识别')
        current_start = today - timedelta(days=(today.weekday() - start.weekday()) % 7)
        return current_start - timedelta(days=7), current_start - timedelta(days=1)
    end = today.replace(day=1) - timedelta(days=1)
    return end.replace(day=1), end


def historical_limits(mode, options):
    lower, upper = explicit_limits(options)
    cutoff = min(china_today(), upper + timedelta(days=1)) if upper and upper < date.max else china_today()
    start, end = latest_complete(mode, options[-1], cutoff)
    if lower and mode == 'week':
        lower += timedelta(days=(bounds(options[-1])[0].weekday() - lower.weekday()) % 7)
    elif lower and mode == 'month' and lower.day != 1:
        lower = lower.replace(day=calendar.monthrange(lower.year, lower.month)[1]) + timedelta(days=1)
    return lower, start, end


def catalog(profiles, base):
    result = []
    for mode, label in LABELS.items():
        options = matching(profiles, base, mode)
        item = {'mode': mode, 'label': label, 'available': bool(options), 'message': ''}
        if options:
            latest = options[-1]
            left, right = bounds(latest)
            minimum = None
            if mode in {'day', 'week', 'month'}:
                minimum, left, right = historical_limits(mode, options)
            item.update(min_anchor=minimum.isoformat() if minimum else None, max_anchor=left.isoformat(),
                        anchor_date=left.isoformat(), start_date=left.isoformat(), end_date=right.isoformat(),
                        path=latest['path'])
        else:
            item['message'] = f'请先在生意参谋切换到{label}并识别一次'
        result.append(item)
    return result


def select(profiles, base, mode, anchor=None):
    if mode not in LABELS:
        raise ValueError('时间入口无效')
    options = matching(profiles, base, mode)
    if not options:
        raise ValueError(f'{LABELS[mode]}接口模板尚未识别 请先在生意参谋打开该入口并识别一次')
    chosen = options[-1]
    first, last = bounds(chosen)
    if mode in {'realtime', 'recent7', 'recent30'}:
        if anchor:
            raise ValueError('实时与滚动周期不接受历史日期 请使用日 周 月入口')
        captured = datetime.fromisoformat(chosen['captured_at'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=8))).date()
        lag = (captured - last).days
        span = (last - first).days
        expected_span = {'realtime': 0, 'recent7': 6, 'recent30': 29}[mode]
        if span != expected_span or lag not in (0, 1):
            raise ValueError('平台滚动周期口径与已识别规则不一致 请重新识别')
        last = china_today() - timedelta(days=lag)
        first = last - timedelta(days=span)
    else:
        try:
            if anchor is not None and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', anchor):
                raise ValueError()
            lower, latest, _ = historical_limits(mode, options)
            target = date.fromisoformat(anchor) if anchor else latest
        except (TypeError, ValueError):
            raise ValueError('日期格式无效 请重新选择') from None
        if mode == 'week':
            # Week alignment is derived from the actual platform sample.
            target -= timedelta(days=(target.weekday() - first.weekday()) % 7)
            end = target + (last - first)
            if (last - first).days != 6:
                raise ValueError('平台周统计范围尚未完整识别')
        elif mode == 'month':
            target = target.replace(day=1)
            end = target.replace(day=calendar.monthrange(target.year, target.month)[1])
        else:
            end = target
        explicit_min, explicit_max = explicit_limits(options)
        if (explicit_min and target < explicit_min) or (explicit_max and end > explicit_max):
            raise ValueError('所选周期超出平台明确提供的查询范围')
        first, last = target, end
    if last > china_today() or (mode != 'realtime' and last == china_today()):
        raise ValueError('历史统计周期尚未结束 请使用实时入口')
    result = copy.deepcopy(chosen)
    requested = first.isoformat() + '|' + last.isoformat()
    result['params']['dateRange'] = requested
    result['request_date_range'] = requested
    result['period'] = {'mode': mode, 'label': LABELS[mode], 'start_date': first.isoformat(), 'end_date': last.isoformat(),
                        'kind': '实时单次快照' if mode == 'realtime' else '历史周期统计'}
    # A template's old total is not an assertion about a new date.
    result['total'] = None
    return result
