from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Literal, Protocol


class LLMError(RuntimeError):
    """Raised when the upstream LLM provider returns an error we want to surface."""


Role = Literal["system", "user", "assistant"]


@dataclass(slots=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(slots=True)
class ChatChunk:
    """Single streamed fragment returned by a provider."""
    delta: str = ""
    done: bool = False
    usage: dict | None = None


@dataclass(slots=True)
class Profile:
    """Runtime view of an llm_profile row (plus decoded params).  Not the DB row itself."""
    id: str
    name: str
    provider: str
    protocol: str
    base_url: str
    api_key: str
    model: str
    temperature: float
    max_tokens: int

    @classmethod
    def from_row(cls, row: dict) -> "Profile":
        return cls(
            id=row["id"],
            name=row["name"],
            provider=row.get("provider") or "custom",
            protocol=row.get("protocol") or "openai-compat",
            base_url=row["base_url"].rstrip("/"),
            api_key=row.get("api_key") or "",
            model=row["model"],
            temperature=float(row.get("temperature", 0.3) or 0.3),
            max_tokens=int(row.get("max_tokens", 2048) or 2048),
        )


class ChatProvider(Protocol):
    async def stream_chat(self, messages: list[ChatMessage]) -> AsyncIterator[ChatChunk]:
        ...
