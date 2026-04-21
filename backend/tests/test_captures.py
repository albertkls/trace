from __future__ import annotations

from .helpers import create_thread


def test_capture_flow(client):
    r = client.post(
        '/api/captures',
        json={'text': '和平台同步 3/15 上线风险', 'category': 'risk'},
    )
    assert r.status_code == 201
    cap = r.json()
    assert cap['thread_id'] is None
    assert cap['category'] == 'risk'

    inbox = client.get('/api/captures/inbox').json()
    assert any(e['id'] == cap['id'] for e in inbox)

    r = client.patch(
        f"/api/captures/{cap['id']}",
        json={'category': 'plan', 'event_date': '2026-04-18'},
    )
    assert r.status_code == 200
    assert r.json()['category'] == 'plan'
    assert r.json()['event_date'] == '2026-04-18'

    thread = create_thread(client, title='归档线程')
    tid = thread['id']
    r = client.patch(f"/api/captures/{cap['id']}", json={'thread_id': tid})
    assert r.status_code == 200
    assert r.json()['thread_id'] == tid

    inbox = client.get('/api/captures/inbox').json()
    assert not any(e['id'] == cap['id'] for e in inbox)

    r = client.post(
        f"/api/captures/{cap['id']}/promote-todo",
        json={'due_date': '2026-04-20'},
    )
    assert r.status_code == 201
    todo = r.json()
    assert todo['text'] == '和平台同步 3/15 上线风险'
    assert todo['due_date'] == '2026-04-20'
    assert todo['thread_id'] == tid

    r = client.delete(f"/api/captures/{cap['id']}")
    assert r.status_code == 204


def test_capture_direct_to_thread(client):
    thread = create_thread(client, title='直接归入线程')
    tid = thread['id']
    r = client.post(
        '/api/captures',
        json={'text': '直接归入线程', 'category': 'progress', 'thread_id': tid},
    )
    assert r.status_code == 201
    assert r.json()['thread_id'] == tid
    inbox = client.get('/api/captures/inbox').json()
    assert not any(e['id'] == r.json()['id'] for e in inbox)


def test_capture_rejects_empty_text(client):
    r = client.post('/api/captures', json={'text': '   '})
    assert r.status_code == 400


def test_capture_rejects_bad_category(client):
    r = client.post('/api/captures', json={'text': 'x', 'category': 'foo'})
    assert r.status_code == 400


def test_capture_allows_duplicate_text(client):
    first = client.post('/api/captures', json={'text': '重复文本', 'category': 'progress'})
    second = client.post('/api/captures', json={'text': '重复文本', 'category': 'progress'})
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()['id'] != second.json()['id']


def test_promote_note_to_evidence_allows_duplicate_text(client):
    note = client.post('/api/notes', json={'title': '重复记事', 'body_md': '重复文本'}).json()
    first = client.post(f"/api/captures/from-note/{note['id']}", json={})
    second = client.post(f"/api/captures/from-note/{note['id']}", json={})
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()['id'] != second.json()['id']


def test_promote_note_to_inbox_respects_explicit_empty_thread(client):
    thread = create_thread(client, title='笔记默认线程')
    note = client.post(
        '/api/notes',
        json={'title': '线程记事', 'body_md': '进入收件箱', 'thread_ids': [thread['id']]},
    ).json()

    promoted = client.post(
        f"/api/captures/from-note/{note['id']}",
        json={'thread_id': ''},
    )
    assert promoted.status_code == 201, promoted.text
    assert promoted.json()['thread_id'] is None


def test_create_thread_with_adopt(client):
    cap = client.post('/api/captures', json={'text': '新课题：供应链洞察', 'category': 'plan'}).json()
    r = client.post('/api/threads', json={'title': '供应链洞察', 'adopt_evidence_id': cap['id']})
    assert r.status_code == 201
    new_thread = r.json()
    detail = client.get(f"/api/threads/{new_thread['id']}").json()
    assert any(e['id'] == cap['id'] for e in detail['evidence'])


def test_patch_thread(client):
    thread = create_thread(client, title='待编辑线程')
    tid = thread['id']
    r = client.patch(f"/api/threads/{tid}", json={'summary': 'new summary', 'status': 'done'})
    assert r.status_code == 200
    assert r.json()['summary'] == 'new summary'
    assert r.json()['status'] == 'done'


def test_patch_thread_rejects_bad_status(client):
    thread = create_thread(client, title='坏状态线程')
    r = client.patch(f"/api/threads/{thread['id']}", json={'status': 'bogus'})
    assert r.status_code == 400
