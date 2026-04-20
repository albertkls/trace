from __future__ import annotations

import json
import os
import sqlite3
from typing import Any

from fastapi.testclient import TestClient


DEFAULT_REPORT_RANGE = {
    "period_start": "2026-04-13",
    "period_end": "2026-04-19",
}


def db_path() -> str:
    value = os.environ.get("TRACE_DB_PATH")
    if not value:
        raise RuntimeError("TRACE_DB_PATH is not set")
    return value


def create_thread(client: TestClient, *, title: str = "测试线程") -> dict[str, Any]:
    response = client.post("/api/threads", json={"title": title})
    assert response.status_code == 201, response.text
    return response.json()


def create_report(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload = {**DEFAULT_REPORT_RANGE, **overrides}
    response = client.post("/api/reports", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def create_profile(
    client: TestClient,
    *,
    name: str = "test-openai",
    api_key: str = "",
    is_default: bool = True,
) -> dict[str, Any]:
    response = client.post(
        "/api/llm/profiles",
        json={
            "name": name,
            "provider": "openai",
            "protocol": "openai-compat",
            "base_url": "https://api.openai.com/v1",
            "api_key": api_key,
            "model": "gpt-4o-mini",
            "is_default": is_default,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_capture(
    client: TestClient,
    *,
    text: str,
    category: str = "progress",
    thread_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"text": text, "category": category}
    if thread_id is not None:
        payload["thread_id"] = thread_id
    response = client.post("/api/captures", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def attach_citations(report_id: str, evidence_ids: list[str]) -> None:
    conn = sqlite3.connect(db_path())
    try:
        conn.execute(
            "UPDATE report SET cited_evidence_json=? WHERE id=?",
            (json.dumps(evidence_ids, ensure_ascii=False), report_id),
        )
        conn.commit()
    finally:
        conn.close()
