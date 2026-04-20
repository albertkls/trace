from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path):
    os.environ["TRACE_DB_PATH"] = str(tmp_path / "trace.sqlite")
    from trace_api.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
    os.environ.pop("TRACE_DB_PATH", None)


def test_profiles_seeded(client):
    r = client.get("/api/llm/profiles")
    assert r.status_code == 200
    profiles = r.json()
    assert len(profiles) >= 1
    assert profiles[0]["api_key_set"] is False


def test_profile_crud(client):
    created = client.post(
        "/api/llm/profiles",
        json={
            "name": "test-openai",
            "provider": "openai",
            "protocol": "openai-compat",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-xxxxxxxxxxxxxxxx",
            "model": "gpt-4o-mini",
            "is_default": True,
        },
    )
    assert created.status_code == 201
    pid = created.json()["id"]
    assert created.json()["api_key_set"] is True
    assert created.json()["api_key"] != "sk-xxxxxxxxxxxxxxxx"  # masked

    patched = client.patch(f"/api/llm/profiles/{pid}", json={"temperature": 0.7})
    assert patched.status_code == 200
    assert patched.json()["temperature"] == 0.7

    # default moved to this profile -> the old seeded default should no longer be default
    listed = client.get("/api/llm/profiles").json()
    defaults = [p for p in listed if p["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == pid

    gone = client.delete(f"/api/llm/profiles/{pid}")
    assert gone.status_code == 204


def test_profile_can_unset_default(client):
    pid = client.get("/api/llm/profiles").json()[0]["id"]
    updated = client.patch(f"/api/llm/profiles/{pid}", json={"is_default": False})
    assert updated.status_code == 200
    assert updated.json()["is_default"] == 0


def test_compose_streams_draft(client, monkeypatch):
    """Mock the provider so we exercise SSE wiring without a real API call."""

    from trace_api.llm import base as llm_base

    class FakeProvider:
        def __init__(self, profile): self.profile = profile

        async def stream_chat(self, messages):
            for piece in ["# 本周综述\n\n", "按证据 ", "[1] 推进", "。\n"]:
                yield llm_base.ChatChunk(delta=piece)
            yield llm_base.ChatChunk(done=True)

    import trace_api.routers.reports as reports_module
    monkeypatch.setattr(reports_module, "build_provider", lambda profile: FakeProvider(profile))

    # Give the default profile a fake key so compose allows it through.
    profiles = client.get("/api/llm/profiles").json()
    default_id = profiles[0]["id"]
    client.patch(f"/api/llm/profiles/{default_id}", json={"api_key": "fake"})

    reports = client.get("/api/reports").json()
    rid = reports[0]["id"]

    with client.stream("POST", f"/api/reports/{rid}/compose", json={}) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")

    assert "event: delta" in body
    assert "event: done" in body
    assert "本周综述" in body

    refreshed = client.get(f"/api/reports/{rid}").json()
    assert "本周综述" in refreshed["body_md"]


def test_compose_rejects_when_no_key(client):
    reports = client.get("/api/reports").json()
    rid = reports[0]["id"]
    r = client.post(f"/api/reports/{rid}/compose", json={})
    assert r.status_code == 400
    assert "api_key" in r.json()["detail"]


def _prime_fake_key(client) -> None:
    profiles = client.get("/api/llm/profiles").json()
    default_id = profiles[0]["id"]
    client.patch(f"/api/llm/profiles/{default_id}", json={"api_key": "fake"})


def _install_fake_provider(monkeypatch, pieces: list[str]):
    """Monkeypatch build_provider in reports router to yield the given deltas."""
    from trace_api.llm import base as llm_base
    import trace_api.routers.reports as reports_module

    class FakeProvider:
        def __init__(self, profile):
            self.profile = profile

        async def stream_chat(self, messages):
            for piece in pieces:
                yield llm_base.ChatChunk(delta=piece)
            yield llm_base.ChatChunk(done=True)

    monkeypatch.setattr(
        reports_module, "build_provider", lambda profile: FakeProvider(profile)
    )


def test_rewrite_continue_returns_append_mode(client, monkeypatch):
    _install_fake_provider(monkeypatch, ["## 下周计划\n\n", "- 跟进联测缺陷\n"])
    _prime_fake_key(client)

    rid = client.get("/api/reports").json()[0]["id"]
    before = client.get(f"/api/reports/{rid}").json()

    with client.stream(
        "POST",
        f"/api/reports/{rid}/rewrite",
        json={"op": "continue", "instruction": "追加下周计划"},
    ) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")

    assert "event: delta" in body
    assert "event: done" in body
    assert '"mode": "append"' in body
    assert "下周计划" in body

    # Rewrite must NOT persist — body is unchanged.
    after = client.get(f"/api/reports/{rid}").json()
    assert after["body_md"] == before["body_md"]


def test_rewrite_compress_returns_replace_mode(client, monkeypatch):
    _install_fake_provider(monkeypatch, ["精简版：项目 A 联测启动。\n"])
    _prime_fake_key(client)
    rid = client.get("/api/reports").json()[0]["id"]

    with client.stream(
        "POST",
        f"/api/reports/{rid}/rewrite",
        json={"op": "compress", "target_chars": 150},
    ) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    assert '"mode": "replace"' in body


def test_rewrite_retone_uses_target_audience(client, monkeypatch):
    _install_fake_provider(monkeypatch, ["（老板口吻重写）\n"])
    _prime_fake_key(client)
    rid = client.get("/api/reports").json()[0]["id"]

    r = client.post(
        f"/api/reports/{rid}/rewrite",
        json={"op": "retone", "target_audience": "bogus"},
    )
    assert r.status_code == 400

    with client.stream(
        "POST",
        f"/api/reports/{rid}/rewrite",
        json={"op": "retone", "target_audience": "boss"},
    ) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    assert '"mode": "replace"' in body


def test_rewrite_custom_requires_instruction(client, monkeypatch):
    _install_fake_provider(monkeypatch, ["ok"])
    _prime_fake_key(client)
    rid = client.get("/api/reports").json()[0]["id"]

    r = client.post(f"/api/reports/{rid}/rewrite", json={"op": "custom"})
    assert r.status_code == 400
    assert "instruction" in r.json()["detail"]


def test_rewrite_rejects_unknown_op(client):
    _prime_fake_key(client)
    rid = client.get("/api/reports").json()[0]["id"]
    r = client.post(f"/api/reports/{rid}/rewrite", json={"op": "bogus"})
    assert r.status_code == 400


def test_rewrite_rejects_when_no_key(client):
    rid = client.get("/api/reports").json()[0]["id"]
    r = client.post(f"/api/reports/{rid}/rewrite", json={"op": "continue"})
    assert r.status_code == 400
    assert "api_key" in r.json()["detail"]


def test_summarize_rejects_when_no_profile(client):
    pid = client.get("/api/llm/profiles").json()[0]["id"]
    client.delete(f"/api/llm/profiles/{pid}")
    tid = client.get("/api/threads").json()[0]["id"]
    r = client.post(f"/api/threads/{tid}/summarize")
    assert r.status_code == 400
    assert "no llm profile configured" in r.json()["detail"]
