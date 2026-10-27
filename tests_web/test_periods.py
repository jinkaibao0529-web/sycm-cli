from copy import deepcopy
from datetime import date
from types import SimpleNamespace

import pytest

from market_web import periods


@pytest.fixture
def profiles(monkeypatch):
    monkeypatch.setattr(periods, 'china_today', lambda: date(2026,10,27))
    samples=[('today','2026-10-27|2026-10-27'),('recent7','2026-10-20|2026-10-26'),
             ('recent30','2026-09-27|2026-10-26'),('day','2026-10-26|2026-10-26'),
             ('day','2026-10-07|2026-10-07'),('week','2026-10-19|2026-10-25'),
             ('week','2026-10-12|2026-10-18'),('month','2026-09-01|2026-09-30'),('month','2026-08-01|2026-08-31')]
    return [dict(id=str(i),path='/live/rank.json' if kind=='today' else '/offline/rank.json',
                 signature=f'original-{i}',captured_at='2026-10-27T01:00:00Z',account_key='account',total=300,
                 params=dict(cateId='test',rankType='gmv',dateType=kind,dateRange=span))
            for i,(kind,span) in enumerate(samples)]


def test_all_six_modes_use_own_observed_request(profiles):
    options=periods.catalog(profiles,profiles[0])
    assert len(options)==6 and all(p['available'] for p in options)
    for p in options:
        chosen=periods.select(profiles,profiles[0],p['mode'])
        assert chosen['period']['mode']==p['mode']
        assert chosen['params']['dateType']==('today' if p['mode']=='realtime' else p['mode'])
        assert chosen['path']==('/live/rank.json' if p['mode']=='realtime' else '/offline/rank.json')
        assert chosen['total'] is None


@pytest.mark.parametrize('mode,anchor,expected',[
    ('day','2026-10-17','2026-10-17|2026-10-17'),
    ('week','2026-10-16','2026-10-12|2026-10-18'),
    ('month','2026-08-22','2026-08-01|2026-08-31'),
])
def test_historical_boundaries_and_immutable_templates(profiles,mode,anchor,expected):
    original=deepcopy(profiles)
    selected=periods.select(profiles,profiles[0],mode,anchor)
    assert selected['params']['dateRange']==expected
    assert selected['request_date_range']==expected
    assert profiles==original
    profiles[0]['params']['cateId']='changed-after-start'
    assert selected['params']['cateId']=='test'


@pytest.mark.parametrize('mode,anchor', [('day','2026-10-27'),('week','2026-11-01'),('month','2026-10-01'),('day','2026-02-30'),('day','20260101')])
def test_future_and_invalid_dates_rejected(profiles,mode,anchor):
    with pytest.raises(ValueError):periods.select(profiles,profiles[0],mode,anchor)


def test_scope_and_account_cannot_fall_back(profiles):
    own=deepcopy(profiles[0]);own['params']['cateId']='different-category'
    assert not any(p['available'] for p in periods.catalog(profiles,own))
    with pytest.raises(ValueError):periods.select(profiles,own,'day')
    own=deepcopy(profiles[0]);own['account_key']='different-account'
    with pytest.raises(ValueError):periods.select(profiles,own,'recent7')


def test_unrecognized_mode_never_reuses_seven_day(profiles):
    with pytest.raises(ValueError):periods.select(profiles[1:2],profiles[1],'month')


def test_rolling_windows_advance_using_observed_lag(profiles,monkeypatch):
    monkeypatch.setattr(periods,'china_today',lambda:date(2026,10,28))
    assert periods.select(profiles,profiles[0],'realtime')['request_date_range']=='2026-10-28|2026-10-28'
    assert periods.select(profiles,profiles[0],'recent7')['request_date_range']=='2026-10-21|2026-10-27'
    assert periods.select(profiles,profiles[0],'recent30')['request_date_range']=='2026-09-28|2026-10-27'


def test_month_leap_year_and_year_crossing(monkeypatch):
    monkeypatch.setattr(periods,'china_today',lambda:date(2024,3,3))
    p=dict(id='m',path='/offline/rank.json',params=dict(dateType='month',dateRange='2024-02-01|2024-02-29'),captured_at='2024-03-03T00:00:00Z')
    assert periods.select([p],p,'month','2024-02-15')['request_date_range']=='2024-02-01|2024-02-29'


def test_legacy_create_and_period_create_api(tmp_path,monkeypatch,profiles):
    from fastapi.testclient import TestClient
    from market_web.app import create_app
    monkeypatch.setenv('MARKET_STATE_DIR',str(tmp_path))
    app=create_app()
    with TestClient(app) as client:
        app.state.coordinator.profiles={p['id']:p for p in profiles}
        assert all(p['available'] for p in client.get('/api/periods?profile_id=0').json()['periods'])
        assert client.get('/api/periods?profile_id=unknown').status_code==422
        token=client.get('/api/session').json()['token'];headers={'X-Market-Token':token}
        process=SimpleNamespace(poll=lambda:0,wait=lambda:0)
        monkeypatch.setattr('market_web.app.subprocess.Popen',lambda *a,**k:process)
        monkeypatch.setattr('market_web.app.threading.Thread',lambda *a,**k:SimpleNamespace(start=lambda:None))
        legacy=client.post('/api/tasks',headers=headers,json={'profile_id':'0'})
        assert legacy.status_code==201 and 'period' not in legacy.json()['profile']
        selected=client.post('/api/tasks',headers=headers,json={'profile_id':'0','period_mode':'month','anchor_date':'2026-08-01'})
        assert selected.status_code==201
        assert selected.json()['profile']['period']['start_date']=='2026-08-01'
        assert client.post('/api/tasks',headers=headers,json={'profile_id':'0','period_mode':'wrong'}).status_code==422
        assert client.post('/api/tasks',headers=headers,json={'profile_id':'0','anchor_date':'2026-10-26'}).status_code==422


@pytest.mark.parametrize('mode,anchor,expected',[
 ('day','2025-01-15','2025-01-15|2025-01-15'),
 ('week','2025-03-12','2025-03-10|2025-03-16'),
 ('month','2025-01-20','2025-01-01|2025-01-31'),
])
def test_uncaptured_historical_dates_are_allowed(profiles,mode,anchor,expected):
    assert periods.select(profiles,profiles[0],mode,anchor)['request_date_range']==expected
    option=next(p for p in periods.catalog(profiles,profiles[0]) if p['mode']==mode)
    assert option['min_anchor'] is None


def test_latest_defaults_come_from_beijing_calendar_not_clicked_date(profiles):
    for p in profiles:
        if p['params']['dateType']=='day':p['params']['dateRange']='2020-01-02|2020-01-02'
        if p['params']['dateType']=='week':p['params']['dateRange']='2019-12-23|2019-12-29'
        if p['params']['dateType']=='month':p['params']['dateRange']='2020-01-01|2020-01-31'
    expected={'day':'2026-10-26|2026-10-26','week':'2026-10-19|2026-10-25','month':'2026-09-01|2026-09-30'}
    for mode,span in expected.items():
        assert periods.select(profiles,profiles[0],mode)['request_date_range']==span
        option=next(p for p in periods.catalog(profiles,profiles[0]) if p['mode']==mode)
        assert option['max_anchor']==span.split('|')[0]


def test_latest_defaults_cross_year_and_month(profiles,monkeypatch):
    monkeypatch.setattr(periods,'china_today',lambda:date(2026,1,1))
    assert periods.select(profiles,profiles[0],'day')['request_date_range']=='2025-12-31|2025-12-31'
    assert periods.select(profiles,profiles[0],'week')['request_date_range']=='2025-12-22|2025-12-28'
    assert periods.select(profiles,profiles[0],'month')['request_date_range']=='2025-12-01|2025-12-31'


def test_only_explicit_platform_limits_are_applied(profiles):
    day=next(p for p in profiles if p['params']['dateType']=='day')
    day['query_limits']={'basis':'observed','earliest_date':'2026-10-01'}
    assert periods.select([day],day,'day','2025-01-01')['request_date_range']=='2025-01-01|2025-01-01'
    day['query_limits']={'basis':'platform_explicit','earliest_date':'2026-01-01','latest_date':'2026-10-20'}
    option=next(p for p in periods.catalog([day],day) if p['mode']=='day')
    assert option['min_anchor']=='2026-01-01' and option['max_anchor']=='2026-10-20'
    with pytest.raises(ValueError,match='平台明确'):periods.select([day],day,'day','2025-01-01')


def test_sources_deduplicate_dates_and_transport_but_keep_business_scope(profiles):
    groups=periods.source_groups(profiles)
    assert len(groups)==1
    stable=next(iter(groups))
    duplicate=deepcopy(profiles[3]);duplicate['id']='new-date';duplicate['params']['dateRange']='2020-01-01|2020-01-01';duplicate['params']['pageSize']='50';duplicate['captured_at']='2026-10-28T00:00:00Z'
    assert set(periods.source_groups([*profiles,duplicate]))=={stable}
    for field,value in [('cateId','other-category'),('rankType','other-ranking'),('minPrice','20'),('orderBy','uv')]:
        changed=deepcopy(profiles[0]);changed['params'][field]=value
        assert len(periods.source_groups([*profiles,changed]))==2
    other=deepcopy(profiles[0]);other['account_key']='another-account'
    assert len(periods.source_groups([*profiles,other]))==2


def test_connection_exposes_grouped_sources_and_keeps_raw_templates(tmp_path,monkeypatch,profiles):
    import json
    from market_web.app import Coordinator
    monkeypatch.setenv('MARKET_STATE_DIR',str(tmp_path))
    monkeypatch.setattr('market_web.app.subprocess.run',lambda *a,**k:SimpleNamespace(stdout=json.dumps({'ok':True,'profiles':profiles})))
    c=Coordinator();c._probe()
    assert len(c.connection['profiles'])==1 and len(c.profiles)==len(profiles)
    source=c.connection['profiles'][0]
    assert source['id'].startswith('source_') and 'account_key' not in source
    assert c.resolve(source['id']) and c.resolve('0')
    assert all(p['available'] for p in periods.catalog(list(c.profiles.values()),c.resolve(source['id'])))
