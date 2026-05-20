from __future__ import annotations

import json
import platform
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..utils import TZ, new_id, now_iso
from ..workspace import request_workspace_id

router = APIRouter(prefix="/attachments", tags=["attachments"])

OwnerType = Literal["project", "thread", "evidence", "note", "report"]
VALID_OWNER_TYPES = {"project", "thread", "evidence", "note", "report"}
SAFE_OPEN_SUFFIXES = {
    ".csv",
    ".gif",
    ".jpeg",
    ".jpg",
    ".json",
    ".markdown",
    ".md",
    ".pdf",
    ".png",
    ".txt",
    ".webp",
}


class AttachmentIn(BaseModel):
    owner_type: OwnerType
    owner_id: str
    file_path: str
    display_name: str | None = None


def _now() -> str:
    return now_iso()


def _resolve_file(raw_path: str) -> Path:
    path = Path(raw_path).expanduser().resolve()
    if not path.exists():
        raise HTTPException(400, "file does not exist")
    if not path.is_file():
        raise HTTPException(400, "path must be a file")
    return path


def _file_metadata(path: Path) -> dict:
    try:
        stat = path.stat()
    except OSError:
        return {
            "exists": False,
            "file_size": None,
            "mtime": None,
        }
    return {
        "exists": path.is_file(),
        "file_size": stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime, TZ).isoformat(timespec="seconds"),
    }


def _can_open_file(path: Path) -> bool:
    return path.suffix.lower() in SAFE_OPEN_SUFFIXES


def _ensure_safe_to_open(path: Path) -> None:
    if not _can_open_file(path):
        raise HTTPException(400, "unsafe file type; reveal in Finder instead")


def _hydrate(row) -> dict:
    item = row_to_dict(row)
    try:
        item["metadata"] = json.loads(item.pop("metadata_json") or "{}")
    except json.JSONDecodeError:
        item["metadata"] = {}
    current = _file_metadata(Path(item["file_path"]).expanduser())
    item["exists"] = current["exists"]
    item["can_open"] = current["exists"] and _can_open_file(Path(item["file_path"]).expanduser())
    if current["exists"]:
        item["file_size"] = current["file_size"]
        item["mtime"] = current["mtime"]
    return item


def _require_owner(conn, owner_type: str, owner_id: str, workspace_id: str) -> None:
    if owner_type not in VALID_OWNER_TYPES:
        raise HTTPException(400, f"owner_type must be one of {sorted(VALID_OWNER_TYPES)}")
    if owner_type == "evidence":
        table = "evidence"
    elif owner_type == "thread":
        table = "thread"
    elif owner_type == "project":
        table = "project"
    elif owner_type == "note":
        table = "note"
    else:
        table = "report"
    row = conn.execute(
        f"SELECT id FROM {table} WHERE id = ? AND workspace_id = ?",
        (owner_id, workspace_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, f"{owner_type} not found")


def delete_owner_attachments(conn, owner_type: str, owner_id: str, workspace_id: str) -> None:
    conn.execute(
        "DELETE FROM attachment WHERE workspace_id = ? AND owner_type = ? AND owner_id = ?",
        (workspace_id, owner_type, owner_id),
    )


@router.get("")
def list_attachments(
    owner_type: OwnerType,
    owner_id: str,
    workspace_id: str = Depends(request_workspace_id),
) -> list[dict]:
    conn = connect()
    try:
        _require_owner(conn, owner_type, owner_id, workspace_id)
        rows = conn.execute(
            """
            SELECT *
            FROM attachment
            WHERE workspace_id = ? AND owner_type = ? AND owner_id = ?
            ORDER BY created_at DESC
            """,
            (workspace_id, owner_type, owner_id),
        ).fetchall()
        return [_hydrate(row) for row in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_attachment(
    body: AttachmentIn,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    path = _resolve_file(body.file_path)
    conn = connect()
    try:
        _require_owner(conn, body.owner_type, body.owner_id, workspace_id)
        attachment_id = new_id("att")
        now = _now()
        metadata = _file_metadata(path)
        display_name = (body.display_name or path.name).strip() or path.name
        conn.execute(
            """
            INSERT INTO attachment
            (id, workspace_id, owner_type, owner_id, file_path, display_name, file_kind,
             file_size, mtime, created_at, last_opened_at, metadata_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                attachment_id,
                workspace_id,
                body.owner_type,
                body.owner_id,
                str(path),
                display_name,
                path.suffix.lower().lstrip(".") or None,
                metadata["file_size"],
                metadata["mtime"],
                now,
                None,
                "{}",
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM attachment WHERE id = ? AND workspace_id = ?",
            (attachment_id, workspace_id),
        ).fetchone()
        return _hydrate(row)
    finally:
        conn.close()


def _get_attachment(conn, attachment_id: str, workspace_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM attachment WHERE id = ? AND workspace_id = ?",
        (attachment_id, workspace_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "attachment not found")
    return _hydrate(row)


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: str,
    workspace_id: str = Depends(request_workspace_id),
) -> None:
    conn = connect()
    try:
        cur = conn.execute(
            "DELETE FROM attachment WHERE id = ? AND workspace_id = ?",
            (attachment_id, workspace_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "attachment not found")
        conn.commit()
    finally:
        conn.close()


@router.post("/{attachment_id}/open")
def open_attachment(
    attachment_id: str,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    if platform.system() != "Darwin":
        raise HTTPException(400, "open is only supported on macOS")
    conn = connect()
    try:
        attachment = _get_attachment(conn, attachment_id, workspace_id)
        path = Path(attachment["file_path"]).expanduser()
        if not path.exists() or not path.is_file():
            raise HTTPException(404, "file not found")
        _ensure_safe_to_open(path)
        subprocess.Popen(["open", str(path)])
        now = _now()
        conn.execute(
            "UPDATE attachment SET last_opened_at = ? WHERE id = ? AND workspace_id = ?",
            (now, attachment_id, workspace_id),
        )
        conn.commit()
        return {"ok": True, "last_opened_at": now}
    finally:
        conn.close()


@router.post("/{attachment_id}/reveal")
def reveal_attachment(
    attachment_id: str,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    if platform.system() != "Darwin":
        raise HTTPException(400, "reveal is only supported on macOS")
    conn = connect()
    try:
        attachment = _get_attachment(conn, attachment_id, workspace_id)
        path = Path(attachment["file_path"]).expanduser()
        if not path.exists() or not path.is_file():
            raise HTTPException(404, "file not found")
        subprocess.Popen(["open", "-R", str(path)])
        return {"ok": True}
    finally:
        conn.close()
