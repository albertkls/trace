from __future__ import annotations

from .anthropic import AnthropicProvider
from .base import ChatProvider, LLMError, Profile
from .openai_compat import OpenAICompatProvider


def build_provider(profile: Profile) -> ChatProvider:
    proto = (profile.protocol or "openai-compat").lower()
    if proto == "openai-compat":
        return OpenAICompatProvider(profile)
    if proto == "anthropic":
        return AnthropicProvider(profile)
    raise LLMError(f"unsupported protocol: {profile.protocol}")
