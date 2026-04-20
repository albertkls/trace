from __future__ import annotations

from .helpers import create_profile, create_report, create_thread


def test_profiles_start_empty(client):
    r = client.get('/api/llm/profiles')
    assert r.status_code == 200
    assert r.json() == []


def test_profile_crud(client):
    created = create_profile(client, api_key='sk-xxxxxxxxxxxxxxxx')
    pid = created['id']
    assert created['api_key_set'] is True
    assert created['api_key'] != 'sk-xxxxxxxxxxxxxxxx'

    patched = client.patch(f"/api/llm/profiles/{pid}", json={'temperature': 0.7})
    assert patched.status_code == 200
    assert patched.json()['temperature'] == 0.7

    listed = client.get('/api/llm/profiles').json()
    defaults = [p for p in listed if p['is_default']]
    assert len(defaults) == 1
    assert defaults[0]['id'] == pid

    gone = client.delete(f"/api/llm/profiles/{pid}")
    assert gone.status_code == 204


def test_profile_can_unset_default(client):
    pid = create_profile(client)['id']
    updated = client.patch(f"/api/llm/profiles/{pid}", json={'is_default': False})
    assert updated.status_code == 200
    assert updated.json()['is_default'] == 0


def test_compose_streams_draft(client, monkeypatch):
    from trace_api.llm import base as llm_base
    import trace_api.routers.reports as reports_module

    class FakeProvider:
        def __init__(self, profile): self.profile = profile

        async def stream_chat(self, messages):
            for piece in ['# 本周综述\n\n', '按证据 ', '[1] 推进', '。\n']:
                yield llm_base.ChatChunk(delta=piece)
            yield llm_base.ChatChunk(done=True)

    monkeypatch.setattr(reports_module, 'build_provider', lambda profile: FakeProvider(profile))

    create_profile(client, api_key='fake')
    report = create_report(client)
    rid = report['id']

    with client.stream('POST', f"/api/reports/{rid}/compose", json={}) as resp:
        assert resp.status_code == 200
        body = b''.join(resp.iter_bytes()).decode('utf-8')

    assert 'event: delta' in body
    assert 'event: done' in body
    assert '本周综述' in body

    refreshed = client.get(f"/api/reports/{rid}").json()
    assert '本周综述' in refreshed['body_md']


def test_compose_rejects_when_no_key(client):
    create_profile(client, api_key='')
    report = create_report(client)
    r = client.post(f"/api/reports/{report['id']}/compose", json={})
    assert r.status_code == 400
    assert 'api_key' in r.json()['detail']


def _install_fake_provider(monkeypatch, pieces: list[str]):
    from trace_api.llm import base as llm_base
    import trace_api.routers.reports as reports_module

    class FakeProvider:
        def __init__(self, profile):
            self.profile = profile

        async def stream_chat(self, messages):
            for piece in pieces:
                yield llm_base.ChatChunk(delta=piece)
            yield llm_base.ChatChunk(done=True)

    monkeypatch.setattr(reports_module, 'build_provider', lambda profile: FakeProvider(profile))


def test_rewrite_continue_returns_append_mode(client, monkeypatch):
    _install_fake_provider(monkeypatch, ['## 下周计划\n\n', '- 跟进联测缺陷\n'])
    create_profile(client, api_key='fake')
    rid = create_report(client)['id']
    before = client.get(f"/api/reports/{rid}").json()

    with client.stream(
        'POST',
        f"/api/reports/{rid}/rewrite",
        json={'op': 'continue', 'instruction': '追加下周计划'},
    ) as resp:
        assert resp.status_code == 200
        body = b''.join(resp.iter_bytes()).decode('utf-8')

    assert 'event: delta' in body
    assert 'event: done' in body
    assert '"mode": "append"' in body
    assert '下周计划' in body

    after = client.get(f"/api/reports/{rid}").json()
    assert after['body_md'] == before['body_md']


def test_rewrite_compress_returns_replace_mode(client, monkeypatch):
    _install_fake_provider(monkeypatch, ['精简版：项目 A 联测启动。\n'])
    create_profile(client, api_key='fake')
    rid = create_report(client)['id']

    with client.stream(
        'POST',
        f"/api/reports/{rid}/rewrite",
        json={'op': 'compress', 'target_chars': 150},
    ) as resp:
        assert resp.status_code == 200
        body = b''.join(resp.iter_bytes()).decode('utf-8')
    assert '"mode": "replace"' in body


def test_rewrite_retone_uses_target_audience(client, monkeypatch):
    _install_fake_provider(monkeypatch, ['（老板口吻重写）\n'])
    create_profile(client, api_key='fake')
    rid = create_report(client)['id']

    r = client.post(f"/api/reports/{rid}/rewrite", json={'op': 'retone', 'target_audience': 'bogus'})
    assert r.status_code == 400

    with client.stream(
        'POST',
        f"/api/reports/{rid}/rewrite",
        json={'op': 'retone', 'target_audience': 'boss'},
    ) as resp:
        assert resp.status_code == 200
        body = b''.join(resp.iter_bytes()).decode('utf-8')
    assert '"mode": "replace"' in body


def test_rewrite_custom_requires_instruction(client, monkeypatch):
    _install_fake_provider(monkeypatch, ['ok'])
    create_profile(client, api_key='fake')
    rid = create_report(client)['id']

    r = client.post(f"/api/reports/{rid}/rewrite", json={'op': 'custom'})
    assert r.status_code == 400
    assert 'instruction' in r.json()['detail']


def test_rewrite_rejects_unknown_op(client):
    create_profile(client, api_key='fake')
    rid = create_report(client)['id']
    r = client.post(f"/api/reports/{rid}/rewrite", json={'op': 'bogus'})
    assert r.status_code == 400


def test_rewrite_rejects_when_no_key(client):
    create_profile(client, api_key='')
    rid = create_report(client)['id']
    r = client.post(f"/api/reports/{rid}/rewrite", json={'op': 'continue'})
    assert r.status_code == 400
    assert 'api_key' in r.json()['detail']


def test_summarize_rejects_when_no_profile(client):
    tid = create_thread(client, title='待总结线程')['id']
    r = client.post(f"/api/threads/{tid}/summarize")
    assert r.status_code == 400
    assert 'no llm profile configured' in r.json()['detail']
