from __future__ import annotations

from .helpers import create_report, create_thread


def test_health(client):
    r = client.get('/api/health')
    assert r.status_code == 200
    assert r.json()['status'] == 'ok'


def test_threads_start_empty(client):
    r = client.get('/api/threads')
    assert r.status_code == 200
    assert r.json() == []


def test_thread_detail(client):
    thread = create_thread(client, title='线程详情测试')
    r = client.get(f"/api/threads/{thread['id']}")
    assert r.status_code == 200
    body = r.json()
    assert 'evidence' in body
    assert 'todos' in body


def test_report_patch(client):
    report = create_report(client)
    r = client.patch(f"/api/reports/{report['id']}", json={'body_md': 'new body'})
    assert r.status_code == 200
    assert r.json()['body_md'] == 'new body'
