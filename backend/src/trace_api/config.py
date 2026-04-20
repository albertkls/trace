from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from platformdirs import PlatformDirs

from . import __version__

APP_NAME = "Trace"


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(name)
    if value is None:
        return default
    items = [item.strip() for item in value.split(",") if item.strip()]
    return tuple(items) if items else default


def runtime_mode() -> str:
    if mode := os.getenv("TRACE_RUNTIME_MODE"):
        return mode
    if getattr(sys, "frozen", False):
        return "desktop"
    return "development"


def default_data_dir() -> Path:
    override = os.getenv("TRACE_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    data_dir = PlatformDirs(appname=APP_NAME, appauthor=False).user_data_path
    return Path(data_dir).expanduser().resolve()


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    mode: str
    host: str
    port: int
    reload: bool
    seed_demo: bool
    allowed_origins: tuple[str, ...]
    log_level: str

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    mode = runtime_mode()
    default_origins = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    return Settings(
        app_name=APP_NAME,
        app_version=__version__,
        mode=mode,
        host=os.getenv("TRACE_HOST", "127.0.0.1"),
        port=int(os.getenv("TRACE_PORT", "8787")),
        reload=_env_bool("TRACE_RELOAD", mode == "development"),
        seed_demo=_env_bool("TRACE_SEED_DEMO", False),
        allowed_origins=_env_list("TRACE_ALLOWED_ORIGINS", default_origins),
        log_level=os.getenv("TRACE_LOG_LEVEL", "info"),
    )


def reset_settings_cache() -> None:
    get_settings.cache_clear()
