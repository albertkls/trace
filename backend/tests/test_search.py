from __future__ import annotations

from .helpers import create_project


def test_search_includes_projects(client):
    project = create_project(client, name='权限平台')
    thread = client.post(
        '/api/threads',
        json={'title': '权限改造', 'project_id': project['id']},
    ).json()

    result = client.get('/api/search?q=权限')
    assert result.status_code == 200
    body = result.json()
    assert any(item['id'] == project['id'] for item in body['projects'])
    assert any(item['id'] == thread['id'] for item in body['threads'])
