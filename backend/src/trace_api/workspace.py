from __future__ import annotations

from fastapi import Header

DEFAULT_WORKSPACE_ID = "ws_default"
DEFAULT_WORKSPACE_NAME = "默认工作区"


def request_workspace_id(x_trace_workspace: str | None = Header(default=None)) -> str:
    value = (x_trace_workspace or DEFAULT_WORKSPACE_ID).strip()
    return value or DEFAULT_WORKSPACE_ID
