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


def test_batch_assign_category_promote_and_delete(client):
    first = client.post('/api/captures', json={'text': '批量一', 'category': 'progress'}).json()
    second = client.post('/api/captures', json={'text': '批量二', 'category': 'progress'}).json()

    category = client.post(
        '/api/captures/batch',
        json={'ids': [first['id'], second['id']], 'action': 'category', 'category': 'risk'},
    )
    assert category.status_code == 200, category.text
    assert category.json()['updated'] == 2
    inbox = client.get('/api/captures/inbox').json()
    assert {item['id']: item['category'] for item in inbox if item['id'] in {first['id'], second['id']}} == {
        first['id']: 'risk',
        second['id']: 'risk',
    }

    thread = create_thread(client, title='批量线程')
    assigned = client.post(
        '/api/captures/batch',
        json={'ids': [first['id'], second['id']], 'action': 'assign_thread', 'thread_id': thread['id']},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()['updated'] == 2
    detail = client.get(f"/api/threads/{thread['id']}").json()
    assert {item['id'] for item in detail['evidence']} >= {first['id'], second['id']}

    promoted = client.post(
        '/api/captures/batch',
        json={'ids': [first['id'], second['id']], 'action': 'promote_todo', 'due_date': '2026-05-30'},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()['promoted'] == 2
    todos = client.get('/api/todos').json()
    assert len([todo for todo in todos if todo['due_date'] == '2026-05-30']) == 2

    deleted = client.post(
        '/api/captures/batch',
        json={'ids': [first['id'], second['id']], 'action': 'delete'},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()['deleted'] == 2


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
