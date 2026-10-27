"""Time selection from observed platform requests, never from guessed endpoints."""
from __future__ import annotations

import calendar
import copy
from datetime import date, datetime, timedelta, timezone

LABELS = {'realtime': '实时', 'recent7': '7天', 'recent30': '30天', 'day': '日', 'week': '周', 'month': '月'}
TYPES = {'today': 'realtime', **{x: x for x in LABELS if x != 'realtime'}}
FILTERS = ('cateId', 'cateFlag', 'rankType', 'sellerType', 'shopType', 'minPrice', 'maxPrice', 'priceSeg', 'keyWord', 'keyword', 'device', 'marketVersion')


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
    return all(a.get('params', {}).get(k, '') == b.get('params', {}).get(k, '') for k in FILTERS)


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


def catalog(profiles, base):
    result = []
    for mode, label in LABELS.items():
        options = matching(profiles, base, mode)
        item = {'mode': mode, 'label': label, 'available': bool(options), 'message': ''}
        if options:
            latest = options[-1]
            left, right = bounds(latest)
            item.update(min_anchor=min(bounds(p)[0] for p in options).isoformat(), max_anchor=left.isoformat(),
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
        raise ValueError(f'{LABELS[mode]}入口尚未识别或无权限 请先在生意参谋打开并识别')
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
            target = date.fromisoformat(anchor) if anchor else first
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
        earliest = min(bounds(p)[0] for p in options)
        latest = max(bounds(p)[1] for p in options)
        if target < earliest or end > latest:
            raise ValueError('所选日期超出已识别的有效范围 请在生意参谋选择该历史周期后重新识别以扩展范围')
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
