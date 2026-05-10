from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path

import pytest

from trace_api.routers import updater


RELEASE_DMG_URL = (
    "https://github.com/albertkls/trace/releases/download/v1.1.2/"
    "Trace-1.1.2-macOS.dmg"
)


def test_check_update_exposes_release_digest(client, monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "tag_name": "v9.9.9",
                "html_url": "https://github.com/albertkls/trace/releases/tag/v9.9.9",
                "body": "更新说明",
                "published_at": "2026-05-10T00:00:00Z",
                "assets": [
                    {
                        "name": "Trace-9.9.9-macOS.dmg",
                        "browser_download_url": RELEASE_DMG_URL,
                        "size": 123,
                        "digest": "sha256:" + "a" * 64,
                    }
                ],
            }

    monkeypatch.setattr(updater.httpx, "get", lambda *args, **kwargs: FakeResponse())

    response = client.get("/api/updater/check")
    assert response.status_code == 200
    body = response.json()
    assert body["update_available"] is True
    assert body["dmg_sha256"] == "a" * 64


def test_download_rejects_non_trace_release_url(client):
    response = client.post(
        "/api/updater/download",
        json={
            "dmg_url": "https://github.com/someone/else/releases/download/v1.0.0/Trace-1.0.0-macOS.dmg"
        },
    )
    assert response.status_code == 400


def test_download_verifies_sha256(client, monkeypatch):
    payload = b"fake dmg bytes"
    expected = hashlib.sha256(payload).hexdigest()

    class FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_bytes(self, chunk_size=65536):
            yield payload

    monkeypatch.setattr(updater.httpx, "stream", lambda *args, **kwargs: FakeStream())

    response = client.post(
        "/api/updater/download",
        json={"dmg_url": RELEASE_DMG_URL, "expected_sha256": expected},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["sha256"] == expected
    assert Path(body["dmg_path"]).is_file()


def test_download_rejects_sha256_mismatch(client, monkeypatch):
    class FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_bytes(self, chunk_size=65536):
            yield b"unexpected"

    monkeypatch.setattr(updater.httpx, "stream", lambda *args, **kwargs: FakeStream())

    response = client.post(
        "/api/updater/download",
        json={"dmg_url": RELEASE_DMG_URL, "expected_sha256": "0" * 64},
    )
    assert response.status_code == 400


def test_apply_requires_update_cache_path(client):
    outside_path = Path(tempfile.gettempdir()) / "Trace-1.1.2-macOS.dmg"
    outside_path.write_bytes(b"fake")
    try:
        response = client.post("/api/updater/apply", json={"dmg_path": str(outside_path)})
        assert response.status_code == 400
    finally:
        outside_path.unlink(missing_ok=True)
