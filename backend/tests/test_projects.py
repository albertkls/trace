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


def test_project_health_and_weekly_metrics(client):
    project = create_project(client, name='健康度项目')
    blocked_thread = client.post(
        '/api/threads',
        json={'title': '阻塞线程', 'project_id': project['id']},
    ).json()
    client.patch(f"/api/threads/{blocked_thread['id']}", json={'status': 'blocked'})
    evidence = create_capture(client, text='本周新增证据', thread_id=blocked_thread['id'])
    todo = client.post(
        '/api/todos',
        json={'text': '待推进事项', 'thread_id': blocked_thread['id']},
    ).json()
    report = create_report(client, project_id=project['id'], thread_ids=[blocked_thread['id']])

    detail = client.get(f"/api/projects/{project['id']}")
    assert detail.status_code == 200, detail.text
    health = detail.json()['health']
    assert health['health_status'] == 'blocked'
    assert health['blocked_thread_count'] == 1
    assert health['open_todo_count'] == 1
    assert health['draft_report_count'] == 1
    assert health['week_evidence_count'] >= 1
    assert health['week_active_thread_count'] >= 1
    assert '阻塞' in health['next_action']

    listed = client.get('/api/projects').json()
    listed_health = next(item['health'] for item in listed if item['id'] == project['id'])
    assert listed_health['blocked_thread_count'] == 1
    assert listed_health['open_todo_count'] == 1
    assert evidence['id']
    assert todo['id']
    assert report['id']
