from __future__ import annotations

from .helpers import create_capture, create_project, create_report


def test_project_crud_and_detail(client):
    created = create_project(client, name='日本市场验证')

    listed = client.get('/api/projects')
    assert listed.status_code == 200
    assert any(project['id'] == created['id'] for project in listed.json())

    thread = client.post(
        '/api/threads',
        json={'title': '访谈推进', 'project_id': created['id']},
    ).json()
    note = client.post(
        '/api/notes',
        json={'title': '访谈笔记', 'project_id': created['id']},
    ).json()
    report = create_report(client, project_id=created['id'], thread_ids=[thread['id']])

    detail = client.get(f"/api/projects/{created['id']}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body['id'] == created['id']
    assert any(item['id'] == thread['id'] for item in body['threads'])
    assert any(item['id'] == note['id'] for item in body['notes'])
    assert any(item['id'] == report['id'] for item in body['reports'])

    patched = client.patch(
        f"/api/projects/{created['id']}",
        json={'name': '日本市场验证 v2', 'status': 'paused'},
    )
    assert patched.status_code == 200, patched.text
    updated = patched.json()
    assert updated['name'] == '日本市场验证 v2'
    assert updated['status'] == 'paused'


def test_thread_legacy_project_name_auto_creates_project(client):
    created = client.post(
        '/api/threads',
        json={'title': '老项目线程', 'project': '平台侧'},
    )
    assert created.status_code == 201, created.text
    thread = created.json()
    assert thread['project'] == '平台侧'
    assert thread['project_id']

    projects = client.get('/api/projects').json()
    assert any(project['name'] == '平台侧' for project in projects)


def test_project_detail_includes_evidence_and_todos(client):
    project = create_project(client, name='项目活动流')
    thread = client.post(
        '/api/threads',
        json={'title': '推进线程', 'project_id': project['id']},
    ).json()
    evidence = create_capture(client, text='完成关键联调', thread_id=thread['id'])
    todo = client.post(
        '/api/todos',
        json={'text': '跟进验收', 'thread_id': thread['id']},
    ).json()

    detail = client.get(f"/api/projects/{project['id']}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert any(item['id'] == evidence['id'] for item in body['evidence'])
    assert any(item['id'] == todo['id'] for item in body['todos'])
