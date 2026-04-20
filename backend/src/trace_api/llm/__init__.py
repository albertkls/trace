"""LLM adapter layer. Two protocols supported:
- openai-compat  → OpenAI / DeepSeek / Moonshot / DashScope-compatible / Ollama / custom
- anthropic      → Anthropic /v1/messages
"""
from .base import ChatChunk, ChatMessage, ChatProvider, LLMError, Profile
from .factory import build_provider

__all__ = [
    "ChatChunk",
    "ChatMessage",
    "ChatProvider",
    "LLMError",
    "Profile",
    "build_provider",
]
