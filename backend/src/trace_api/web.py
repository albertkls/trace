from __future__ import annotations

import logging
import os
import sys
import uuid
from contextvars import ContextVar
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

if TYPE_CHECKING:
    from starlette.responses import Response

logger = logging.getLogger(__name__)

# Module-level context variable for request-scoped request IDs
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

# Response header name
REQUEST_ID_HEADER = "X-Request-Id"


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)
        except (StarletteHTTPException, RuntimeError) as exc:
            status_code = getattr(exc, "status_code", None)
            if status_code == 404:
                return await super().get_response("index.html", scope)
            raise


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject X-Request-Id: use client-supplied value or generate a UUID."""

    async def dispatch(self, request: Request, call_next) -> "Response":
        raw = request.headers.get(REQUEST_ID_HEADER)
        req_id = raw if raw else str(uuid.uuid4())
        request_id_var.set(req_id)
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = req_id
        return response


def resolve_frontend_dist() -> Path | None:
    candidates: list[Path] = []

    if override := os.getenv("TRACE_FRONTEND_DIST"):
        candidates.append(Path(override).expanduser())

    if bundle_root := getattr(sys, "_MEIPASS", None):
        candidates.append(Path(bundle_root) / "frontend_dist")

    package_dir = Path(__file__).resolve().parent
    candidates.append(package_dir / "frontend_dist")
    candidates.append(package_dir.parent.parent.parent / "frontend" / "dist")

    for candidate in candidates:
        path = candidate.resolve()
        if (path / "index.html").exists():
            return path
    return None


def mount_frontend(app: FastAPI) -> Path | None:
    app.add_middleware(RequestIdMiddleware)
    dist = resolve_frontend_dist()
    if dist is None:
        logger.info("frontend dist not found; API-only mode enabled")
        return None

    logger.info("serving frontend from %s", dist)
    app.mount("/", SPAStaticFiles(directory=dist, html=True), name="trace-frontend")
    return dist
