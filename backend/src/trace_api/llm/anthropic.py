"""Anthropic /v1/messages SSE protocol."""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from .base import ChatChunk, ChatMessage, LLMError, Profile


ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider:
    def __init__(self, profile: Profile, *, timeout: float = 60.0) -> None:
        self.profile = profile
        self.timeout = timeout

    async def stream_chat(self, messages: list[ChatMessage]) -> AsyncIterator[ChatChunk]:
        system_parts = [m.content for m in messages if m.role == "system"]
        convo = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        payload: dict = {
            "model": self.profile.model,
            "max_tokens": self.profile.max_tokens,
            "temperature": self.profile.temperature,
            "messages": convo,
            "stream": True,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)

        headers = {
            "Content-Type": "application/json",
            "anthropic-version": ANTHROPIC_VERSION,
            "x-api-key": self.profile.api_key,
        }
        url = f"{self.profile.base_url}/v1/messages"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", errors="replace")
                        raise LLMError(f"{resp.status_code} {resp.reason_phrase}: {body[:400]}")
                    async for raw in resp.aiter_lines():
                        async for chunk in _parse_sse_line(raw):
                            yield chunk
            except httpx.HTTPError as e:
                raise LLMError(f"network error: {e}") from e

    async def chat(self, messages: list[ChatMessage]) -> str:
        out: list[str] = []
        async for chunk in self.stream_chat(messages):
            if chunk.delta:
                out.append(chunk.delta)
            if chunk.done:
                break
        return "".join(out)


async def _parse_sse_line(raw: str):
    line = raw.strip()
    if not line or not line.startswith("data:"):
        return
    data = line[5:].strip()
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return
    ev = obj.get("type")
    if ev == "content_block_delta":
        delta = obj.get("delta") or {}
        text = delta.get("text") or ""
        if text:
            yield ChatChunk(delta=text)
    elif ev == "message_stop":
        yield ChatChunk(done=True)
    elif ev == "message_delta":
        usage = obj.get("usage")
        if usage:
            yield ChatChunk(usage=usage)
