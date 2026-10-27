from urllib.parse import unquote

import pytest

from market_web.export_name import content_disposition, download_names


def task(mode='day', start='2026-10-15', end='2026-10-15', status='completed'):
    return {'id': 'a' * 32, 'status': status, 'created_at': '2026-10-27T01:18:29Z',
            'profile': {'params': {'dateType': mode, 'dateRange': start + '|' + end},
                        'period': {'mode': mode, 'start_date': start, 'end_date': end}}}


@pytest.mark.parametrize('mode,start,end,expected', [
    ('realtime', '2026-10-27', '2026-10-27', '实时_2026-10-27_091829'),
    ('recent7', '2025-12-29', '2026-01-04', '7天_2025-12-29_2026-01-04'),
    ('recent30', '2026-09-27', '2026-10-26', '30天_2026-09-27_2026-10-26'),
    ('day', '2024-02-29', '2024-02-29', '日_2024-02-29'),
    ('week', '2026-10-19', '2026-10-25', '周_2026-10-19_2026-10-25'),
    ('month', '2026-09-01', '2026-09-30', '月_2026-09'),
])
def test_period_names(mode, start, end, expected):
    t = task(mode, start, end)
    assert download_names(t)[0] == f'市场商品榜_{expected}.xlsx'
    header = content_disposition(t)
    assert header.isascii()
    assert unquote(header.split("filename*=UTF-8''")[1]) == download_names(t)[0]


@pytest.mark.parametrize('status', ['cancelled', 'failed', 'interrupted'])
def test_partial_names(status):
    assert download_names(task(status=status))[0].endswith('_部分结果.xlsx')


def test_legacy_saved_range_and_unknown():
    t = task()
    del t['profile']['period']
    t['profile']['request_date_range'] = '2025-01-15|2025-01-15'
    assert download_names(t)[0] == '市场商品榜_日_2025-01-15.xlsx'
    t['profile']['request_date_range'] = 'invalid'
    assert download_names(t)[0] == f'市场商品榜_日期未识别_{t["id"]}.xlsx'


def test_realtime_rollover_and_unchanged_saved_task():
    t = task('realtime')
    t['created_at'] = '2025-12-31T18:00:01+00:00'
    assert download_names(t)[0] == '市场商品榜_实时_2026-01-01_020001.xlsx'
    assert t['profile']['period']['start_date'] == '2026-10-15'
