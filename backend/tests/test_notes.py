from __future__ import annotations

import sqlite3
from pathlib import Path

from trace_api.db import ensure_schema

from .helpers import create_project, create_thread


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


def test_note_dedupes_thread_ids(client):
    thread_id = create_thread(client, title='去重线程')['id']
    r = client.post('/api/notes', json={'title': '去重', 'thread_ids': [thread_id, thread_id]})
    assert r.status_code == 201
    assert r.json()['thread_ids'] == [thread_id]


def test_note_migration_adds_thread_ids_json(tmp_path: Path):
    db_path = tmp_path / 'trace.sqlite'
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            '''
            CREATE TABLE note (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body_md TEXT NOT NULL DEFAULT '',
                day TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            '''
        )
        conn.commit()
    finally:
        conn.close()

    ensure_schema(db_path)

    conn = sqlite3.connect(db_path)
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(note)").fetchall()}
    finally:
        conn.close()
    assert 'thread_ids_json' in cols


def test_note_create_rejects_bad_thread(client):
    r = client.post('/api/notes', json={'thread_ids': ['th_nope']})
    assert r.status_code == 404


def test_note_supports_project_and_filter(client):
    project = create_project(client, name='增长项目')
    response = client.post(
        '/api/notes',
        json={'title': '增长想法', 'project_id': project['id']},
    )
    assert response.status_code == 201, response.text
    note = response.json()
    assert note['project_id'] == project['id']
    assert note['project_name'] == '增长项目'

    filtered = client.get(f"/api/notes?project_id={project['id']}")
    assert filtered.status_code == 200
    assert [item['id'] for item in filtered.json()] == [note['id']]


def test_note_list_ordered_by_day_desc(client):
    a = client.post('/api/notes', json={'title': '老', 'day': '2026-04-10'}).json()
    b = client.post('/api/notes', json={'title': '新', 'day': '2026-04-18'}).json()
    c = client.post('/api/notes', json={'title': '居中', 'day': '2026-04-15'}).json()
    ids = [n['id'] for n in client.get('/api/notes').json()]
    assert ids.index(b['id']) < ids.index(c['id']) < ids.index(a['id'])


def test_note_delete_404(client):
    r = client.delete('/api/notes/nt_nope')
    assert r.status_code == 404
