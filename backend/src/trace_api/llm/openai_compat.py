"""OpenAI Chat Completions SSE protocol — covers OpenAI, DeepSeek, Moonshot,
DashScope (compatible-mode), Ollama, and most router gateways."""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from .base import ChatChunk, ChatMessage, LLMError, Profile


_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0)


class OpenAICompatProvider:
    def __init__(self, profile: Profile, *, timeout: httpx.Timeout = _TIMEOUT) -> None:
        self.profile = profile
        self.timeout = timeout

    async def stream_chat(self, messages: list[ChatMessage]) -> AsyncIterator[ChatChunk]:
        payload = {
            "model": self.profile.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": self.profile.temperature,
            "max_tokens": self.profile.max_tokens,
            "stream": True,
        }
        headers = {"Content-Type": "application/json"}
        if self.profile.api_key:
            headers["Authorization"] = f"Bearer {self.profile.api_key}"

        url = f"{self.profile.base_url}/chat/completions"

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
        """Non-streaming helper — concatenates all deltas. Useful for the test-connection ping."""
        out: list[str] = []
        async for chunk in self.stream_chat(messages):
            if chunk.delta:
                out.append(chunk.delta)
            if chunk.done:
                break
        return "".join(out)


async def _parse_sse_line(raw: str):
    """Yield zero or more ChatChunk from a single SSE line."""
    line = raw.strip()
    if not line or not line.startswith("data:"):
        return
    data = line[5:].strip()
    if data == "[DONE]":
        yield ChatChunk(done=True)
        return
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return
    choices = obj.get("choices") or []
    if not choices:
        usage = obj.get("usage")
        if usage:
            yield ChatChunk(usage=usage)
        return
    delta = choices[0].get("delta") or {}
    content = delta.get("content") or ""
    finish = choices[0].get("finish_reason")
    if content:
        yield ChatChunk(delta=content)
    if finish:
        yield ChatChunk(done=True, usage=obj.get("usage"))
