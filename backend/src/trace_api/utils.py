from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))


def now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def today_iso() -> str:
    return datetime.now(TZ).date().isoformat()


def local_minute() -> str:
    """Minute-precision local timestamp matching the frontend's datetime-local form."""
    return datetime.now(TZ).strftime("%Y-%m-%dT%H:%M")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def safe_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        result = json.loads(raw)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []
