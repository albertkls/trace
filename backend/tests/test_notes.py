from __future__ import annotations

from .helpers import create_thread


def test_note_crud(client):
    r = client.post('/api/notes', json={'title': '脑暴', 'body_md': '- 想法 1'})
    assert r.status_code == 201
    n = r.json()
    assert n['title'] == '脑暴'
    assert n['body_md'] == '- 想法 1'
    assert n['day']
    assert n['thread_ids'] == []

    r = client.get(f"/api/notes/{n['id']}")
    assert r.status_code == 200
    assert r.json()['id'] == n['id']

    notes = client.get('/api/notes').json()
    assert any(x['id'] == n['id'] for x in notes)

    r = client.patch(f"/api/notes/{n['id']}", json={'title': '脑暴 v2', 'body_md': '更新'})
    assert r.status_code == 200
    body = r.json()
    assert body['title'] == '脑暴 v2'
    assert body['body_md'] == '更新'

    thread_id = create_thread(client, title='笔记挂接线程')['id']
    r = client.patch(f"/api/notes/{n['id']}", json={'thread_ids': [thread_id]})
    assert r.status_code == 200
    assert r.json()['thread_ids'] == [thread_id]

    r = client.patch(f"/api/notes/{n['id']}", json={'thread_ids': [thread_id, 'th_nope']})
    assert r.status_code == 404

    r = client.patch(f"/api/notes/{n['id']}", json={'thread_ids': []})
    assert r.status_code == 200
    assert r.json()['thread_ids'] == []

    r = client.delete(f"/api/notes/{n['id']}")
    assert r.status_code == 204
    r = client.get(f"/api/notes/{n['id']}")
    assert r.status_code == 404


def test_note_create_with_threads(client):
    thread_id = create_thread(client, title='建笔记线程')['id']
    r = client.post('/api/notes', json={'title': '', 'body_md': '', 'thread_ids': [thread_id]})
    assert r.status_code == 201
    assert r.json()['thread_ids'] == [thread_id]


def test_note_create_rejects_bad_thread(client):
    r = client.post('/api/notes', json={'thread_ids': ['th_nope']})
    assert r.status_code == 404


def test_note_list_ordered_by_day_desc(client):
    a = client.post('/api/notes', json={'title': '老', 'day': '2026-04-10'}).json()
    b = client.post('/api/notes', json={'title': '新', 'day': '2026-04-18'}).json()
    c = client.post('/api/notes', json={'title': '居中', 'day': '2026-04-15'}).json()
    ids = [n['id'] for n in client.get('/api/notes').json()]
    assert ids.index(b['id']) < ids.index(c['id']) < ids.index(a['id'])


def test_note_delete_404(client):
    r = client.delete('/api/notes/nt_nope')
    assert r.status_code == 404
