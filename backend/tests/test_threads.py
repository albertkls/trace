from __future__ import annotations

from datetime import date, timedelta

from .helpers import create_project, create_thread


def test_patch_thread_updates_editable_fields(client):
    thread_id = create_thread(client, title='原始线程')['id']

    r = client.patch(
        f"/api/threads/{thread_id}",
        json={
            'title': '工作线编辑已接入',
            'project': '平台侧',
            'owner': 'Albert',
            'status': 'blocked',
            'pinned': True,
            'started_at': '2026-04-01',
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['title'] == '工作线编辑已接入'
    assert body['project'] == '平台侧'
    assert body['owner'] == 'Albert'
    assert body['status'] == 'blocked'
    assert body['pinned'] == 1
    assert body['started_at'] == '2026-04-01'


def test_patch_thread_can_clear_optional_fields(client):
    thread_id = create_thread(client, title='可清空字段')['id']

    seeded = client.patch(f"/api/threads/{thread_id}", json={'project': '平台侧', 'owner': 'Albert'})
    assert seeded.status_code == 200, seeded.text

    cleared = client.patch(f"/api/threads/{thread_id}", json={'project': None, 'owner': None})
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body['project'] is None
    assert body['owner'] is None


def test_patch_thread_rejects_future_started_at(client):
    thread_id = create_thread(client, title='未来日期线程')['id']
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    r = client.patch(f"/api/threads/{thread_id}", json={'started_at': tomorrow})
    assert r.status_code == 400
    assert 'future' in r.text


def test_thread_can_bind_project_by_id_and_filter(client):
    project = create_project(client, name='平台侧')
    response = client.post(
        '/api/threads',
        json={'title': '项目线程', 'project_id': project['id']},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body['project_id'] == project['id']
    assert body['project'] == '平台侧'

    filtered = client.get(f"/api/threads?project_id={project['id']}")
    assert filtered.status_code == 200
    assert [thread['id'] for thread in filtered.json()['items']] == [body['id']]
