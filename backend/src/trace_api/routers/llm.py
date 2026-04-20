from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..llm import LLMError, Profile, build_provider
from ..llm.prompts import build_test_messages

router = APIRouter(prefix="/llm", tags=["llm"])


PROFILE_COLUMNS = (
    "id, name, provider, protocol, base_url, api_key, model, temperature, max_tokens, is_default"
)


class ProfileIn(BaseModel):
    name: str
    provider: str = "custom"
    protocol: str = "openai-compat"
    base_url: str
    api_key: str = ""
    model: str
    temperature: float = 0.3
    max_tokens: int = 2048
    is_default: bool = False


class ProfilePatch(BaseModel):
    name: str | None = None
    provider: str | None = None
    protocol: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    is_default: bool | None = None


def _mask(row: dict) -> dict:
    key = row.get("api_key") or ""
    if key:
        row["api_key"] = f"{key[:3]}…{key[-4:]}" if len(key) > 8 else "•" * len(key)
        row["api_key_set"] = True
    else:
        row["api_key"] = ""
        row["api_key_set"] = False
    return row


@router.get("/profiles")
def list_profiles() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile ORDER BY is_default DESC, name"
        ).fetchall()
        return [_mask(row_to_dict(r)) for r in rows]
    finally:
        conn.close()


@router.post("/profiles", status_code=201)
def create_profile(body: ProfileIn) -> dict:
    conn = connect()
    try:
        new_id = f"llm_{uuid.uuid4().hex[:12]}"
        cur = conn.cursor()
        if body.is_default:
            cur.execute("UPDATE llm_profile SET is_default = 0")
        cur.execute(
            "INSERT INTO llm_profile (id,name,provider,protocol,base_url,api_key,model,temperature,max_tokens,is_default) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                new_id,
                body.name,
                body.provider,
                body.protocol,
                body.base_url.rstrip("/"),
                body.api_key,
                body.model,
                body.temperature,
                body.max_tokens,
                1 if body.is_default else 0,
            ),
        )
        conn.commit()
        row = cur.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile WHERE id = ?", (new_id,)
        ).fetchone()
        return _mask(row_to_dict(row))
    finally:
        conn.close()


@router.patch("/profiles/{profile_id}")
def update_profile(profile_id: str, patch: ProfilePatch) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile WHERE id = ?", (profile_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "profile not found")
        current = row_to_dict(row)
        fields = {
            "name": patch.name if patch.name is not None else current["name"],
            "provider": patch.provider if patch.provider is not None else current["provider"],
            "protocol": patch.protocol if patch.protocol is not None else current["protocol"],
            "base_url": (patch.base_url or current["base_url"]).rstrip("/"),
            "api_key": patch.api_key if patch.api_key is not None else current["api_key"],
            "model": patch.model if patch.model is not None else current["model"],
            "temperature": (
                patch.temperature if patch.temperature is not None else current["temperature"]
            ),
            "max_tokens": (
                patch.max_tokens if patch.max_tokens is not None else current["max_tokens"]
            ),
        }
        cur = conn.cursor()
        if patch.is_default is True:
            cur.execute("UPDATE llm_profile SET is_default = 0")
        if patch.is_default is None:
            is_default = current["is_default"]
        else:
            is_default = 1 if patch.is_default else 0
        cur.execute(
            "UPDATE llm_profile SET name=?, provider=?, protocol=?, base_url=?, api_key=?, "
            "model=?, temperature=?, max_tokens=?, is_default=? WHERE id=?",
            (
                fields["name"],
                fields["provider"],
                fields["protocol"],
                fields["base_url"],
                fields["api_key"],
                fields["model"],
                fields["temperature"],
                fields["max_tokens"],
                is_default,
                profile_id,
            ),
        )
        conn.commit()
        row = cur.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile WHERE id = ?", (profile_id,)
        ).fetchone()
        return _mask(row_to_dict(row))
    finally:
        conn.close()


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: str) -> None:
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM llm_profile WHERE id = ?", (profile_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "profile not found")
        # Ensure there is always a default if any profile remains.
        remaining = cur.execute(
            "SELECT id, is_default FROM llm_profile"
        ).fetchall()
        if remaining and not any(r["is_default"] for r in remaining):
            cur.execute(
                "UPDATE llm_profile SET is_default = 1 WHERE id = ?",
                (remaining[0]["id"],),
            )
        conn.commit()
    finally:
        conn.close()


@router.post("/profiles/{profile_id}/test")
async def test_profile(profile_id: str) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile WHERE id = ?", (profile_id,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "profile not found")
    profile = Profile.from_row(row_to_dict(row))
    if not profile.api_key:
        raise HTTPException(400, "profile has no api_key configured")

    provider = build_provider(profile)
    started = time.perf_counter()
    try:
        reply = await provider.chat(build_test_messages())  # type: ignore[attr-defined]
    except LLMError as e:
        raise HTTPException(502, f"provider error: {e}") from e
    elapsed = int((time.perf_counter() - started) * 1000)
    return {"ok": True, "latency_ms": elapsed, "reply": reply.strip()}


def get_default_profile() -> Profile | None:
    conn = connect()
    try:
        row = conn.execute(
            f"SELECT {PROFILE_COLUMNS} FROM llm_profile WHERE is_default = 1 LIMIT 1"
        ).fetchone()
        if not row:
            row = conn.execute(
                f"SELECT {PROFILE_COLUMNS} FROM llm_profile LIMIT 1"
            ).fetchone()
        if not row:
            return None
        return Profile.from_row(row_to_dict(row))
    finally:
        conn.close()
