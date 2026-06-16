from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from .. import __version__
from ..db import connect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/healthz", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    db: bool
    version: str
    workspace_mode: str
    timestamp: str


def _check_db() -> bool:
    try:
        conn = connect()
        try:
            conn.execute("SELECT 1")
            return True
        finally:
            conn.close()
    except Exception:
        return False


@router.get("", response_model=HealthResponse)
def healthz() -> dict[str, Any]:
    db_ok = _check_db()
    status = "ok" if db_ok else "down"
    return {
        "status": status,
        "db": db_ok,
        "version": __version__,
        "workspace_mode": "single",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
