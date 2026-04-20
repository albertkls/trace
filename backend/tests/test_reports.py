from __future__ import annotations

import json
import sqlite3

from .helpers import attach_citations, create_capture, create_report, create_thread, db_path


def test_create_weekly_report_autolabels(client):
    r = client.post(
        '/api/reports',
        json={'period_start': '2026-04-13', 'period_end': '2026-04-19', 'audience': 'boss'},
    )
    assert r.status_code == 200, r.text
    rp = r.json()
    assert rp['period_label'] == '2026-W16'
    assert rp['audience'] == 'boss'
    assert rp['status'] == 'draft'
    assert '周报' in rp['title']
    assert '老板版' in rp['title']
    assert rp['body_md'] == ''

    listed = client.get('/api/reports').json()
    assert any(x['id'] == rp['id'] for x in listed)


def test_create_monthly_report_autolabels(client):
    r = client.post(
        '/api/reports',
        json={'period_start': '2026-03-01', 'period_end': '2026-03-31', 'audience': 'self'},
    )
    assert r.status_code == 200, r.text
    rp = r.json()
    assert rp['period_label'] == '2026-03'
    assert '月报' in rp['title']
    assert '自留' in rp['title']


def test_create_custom_range_report(client):
    r = client.post(
        '/api/reports',
        json={
            'period_start': '2026-01-01',
            'period_end': '2026-03-31',
            'audience': 'retro',
            'title': 'Q1 复盘',
        },
    )
    assert r.status_code == 200, r.text
    rp = r.json()
    assert rp['period_label'] == '2026-01-01~2026-03-31'
    assert rp['title'] == 'Q1 复盘'
    assert rp['audience'] == 'retro'


def test_create_rejects_bad_audience(client):
    r = client.post('/api/reports', json={'period_start': '2026-04-13', 'period_end': '2026-04-19', 'audience': 'nope'})
    assert r.status_code == 400


def test_create_rejects_reversed_period(client):
    r = client.post('/api/reports', json={'period_start': '2026-04-19', 'period_end': '2026-04-13'})
    assert r.status_code == 400


def test_create_rejects_bad_date(client):
    r = client.post('/api/reports', json={'period_start': 'not-a-date', 'period_end': '2026-04-13'})
    assert r.status_code == 400


def test_patch_changes_period_and_relabels(client):
    rid = create_report(client)['id']
    r = client.patch(f"/api/reports/{rid}", json={'period_start': '2026-04-20', 'period_end': '2026-04-26'})
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated['period_start'] == '2026-04-20'
    assert updated['period_end'] == '2026-04-26'
    assert updated['period_label'] == '2026-W17'


def test_patch_audience_only(client):
    created = create_report(client)
    r = client.patch(f"/api/reports/{created['id']}", json={'audience': 'internal'})
    assert r.status_code == 200, r.text
    assert r.json()['audience'] == 'internal'
    assert r.json()['period_label'] == created['period_label']


def test_patch_explicit_label_wins(client):
    created = create_report(client)
    r = client.patch(
        f"/api/reports/{created['id']}",
        json={'period_start': '2026-04-20', 'period_end': '2026-04-26', 'period_label': 'Sprint-7'},
    )
    assert r.status_code == 200, r.text
    assert r.json()['period_label'] == 'Sprint-7'


def test_patch_rejects_bad_status(client):
    rid = create_report(client)['id']
    r = client.patch(f"/api/reports/{rid}", json={'status': 'bogus'})
    assert r.status_code == 400


def test_get_report_hydrates_cited_evidence(client):
    thread = create_thread(client, title='引用线程')
    ev1 = create_capture(client, text='第一条证据', thread_id=thread['id'])
    ev2 = create_capture(client, text='第二条证据', category='plan', thread_id=thread['id'])
    report = create_report(client)
    attach_citations(report['id'], [ev1['id'], ev2['id']])

    detail = client.get(f"/api/reports/{report['id']}").json()
    ids = detail['cited_evidence']
    assert ids == [ev1['id'], ev2['id']]
    detail_list = detail['cited_evidence_detail']
    assert [d['id'] for d in detail_list] == ids
    for d in detail_list:
        assert 'text' in d and d['text']
        assert 'category' in d
        assert 'event_date' in d
        assert 'thread_title' in d
        assert isinstance(d['owners'], list)
        assert isinstance(d['tags'], list)


def test_get_report_tombstones_missing_evidence(client):
    created = create_report(client)
    conn = sqlite3.connect(db_path())
    try:
        conn.execute('UPDATE report SET cited_evidence_json=? WHERE id=?', (json.dumps(['ev_ghost_123']), created['id']))
        conn.commit()
    finally:
        conn.close()

    fetched = client.get(f"/api/reports/{created['id']}").json()
    assert fetched['cited_evidence'] == ['ev_ghost_123']
    detail = fetched['cited_evidence_detail']
    assert len(detail) == 1
    assert detail[0]['id'] == 'ev_ghost_123'
    assert detail[0].get('missing') is True


def test_delete_report(client):
    rid = create_report(client)['id']
    r = client.delete(f"/api/reports/{rid}")
    assert r.status_code == 200
    assert r.json()['ok'] is True

    r2 = client.get(f"/api/reports/{rid}")
    assert r2.status_code == 404

    r3 = client.delete(f"/api/reports/{rid}")
    assert r3.status_code == 404
