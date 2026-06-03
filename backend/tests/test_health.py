from __future__ import annotations

import uuid


def test_healthz_returns_ok(client):
    r = client.get("/api/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] is True
    assert "version" in body
    assert "workspace_count" in body
    assert body["workspace_count"] >= 1
    assert "timestamp" in body


def test_healthz_includes_request_id_in_response(client):
    r = client.get("/api/healthz")
    assert r.status_code == 200
    assert "X-Request-Id" in r.headers
    assert len(r.headers["X-Request-Id"]) == 36  # UUID v4


def test_request_id_propagates_from_header(client):
    custom_id = str(uuid.uuid4())
    r = client.get("/api/healthz", headers={"X-Request-Id": custom_id})
    assert r.status_code == 200
    assert r.headers["X-Request-Id"] == custom_id
