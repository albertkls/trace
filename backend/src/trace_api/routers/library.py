from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect
from ..utils import TZ, new_id, now_iso
from ..workspace import DEFAULT_WORKSPACE_ID, request_workspace_id

router = APIRouter(prefix="/library", tags=["library"])
MAX_MARKDOWN_BYTES = 5 * 1024 * 1024


class LibraryConfigIn(BaseModel):
    path: str
    auto_scan: bool | None = None


class LibraryScanIn(BaseModel):
    path: str | None = None


class LibraryRevealIn(BaseModel):
    path: str


def _path_key(workspace_id: str) -> str:
    return f"library.path:{workspace_id}"


def _last_scan_key(workspace_id: str) -> str:
    return f"library.last_scan:{workspace_id}"


def _last_result_key(workspace_id: str) -> str:
    return f"library.last_result:{workspace_id}"


def _auto_scan_key(workspace_id: str) -> str:
    return f"library.auto_scan:{workspace_id}"


def _resolve_dir(raw_path: str) -> Path:
    path = Path(raw_path).expanduser().resolve()
    if not path.exists():
        raise HTTPException(400, "path does not exist")
    if not path.is_dir():
        raise HTTPException(400, "path must be a directory")
    return path


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _file_hash(workspace_id: str, path: Path, text: str) -> str:
    payload = f"library:{workspace_id}:{path}:{_hash(text)}"
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _event_time(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, TZ).strftime("%Y-%m-%dT%H:%M")


def _iter_markdown(root: Path) -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.md", "*.markdown"):
        paths = root.rglob(pattern)
        for path in paths:
            if any(part.startswith(".") for part in path.relative_to(root).parts):
                continue
            if path.is_file():
                files.append(path)
    return sorted(set(files), key=lambda p: str(p.relative_to(root)).lower())


def _is_inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _cleanup_missing_files(conn, *, root: Path, current_paths: set[str], workspace_id: str) -> int:
    rows = conn.execute(
        "SELECT id, file_path FROM source WHERE workspace_id = ? AND kind = 'file' AND file_path IS NOT NULL",
        (workspace_id,),
    ).fetchall()
    removed = 0
    for row in rows:
        file_path = Path(row["file_path"]).expanduser().resolve()
        if not _is_inside(file_path, root) or str(file_path) in current_paths or file_path.exists():
            continue
        capture_rows = conn.execute(
            "SELECT id FROM capture WHERE source_id = ?",
            (row["id"],),
        ).fetchall()
        capture_ids = [capture["id"] for capture in capture_rows]
        if capture_ids:
            placeholders = ",".join("?" for _ in capture_ids)
            conn.execute(
                f"DELETE FROM evidence WHERE workspace_id = ? AND thread_id IS NULL AND capture_id IN ({placeholders})",
                (workspace_id, *capture_ids),
            )
        conn.execute(
            "DELETE FROM source WHERE id = ? AND workspace_id = ?",
            (row["id"], workspace_id),
        )
        removed += 1
    return removed


def _get_configured_path(conn, workspace_id: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM settings WHERE key = ?",
        (_path_key(workspace_id),),
    ).fetchone()
    return row["value"] if row else None


def _set_setting(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key,value) VALUES (?,?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def _get_bool_setting(conn, key: str, default: bool) -> bool:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    return row["value"] == "1"


def _set_bool_setting(conn, key: str, value: bool) -> None:
    _set_setting(conn, key, "1" if value else "0")


def _get_json_setting(conn, key: str) -> dict | None:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    try:
        value = json.loads(row["value"])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _read_markdown(path: Path) -> str:
    size = path.stat().st_size
    if size > MAX_MARKDOWN_BYTES:
        mb = MAX_MARKDOWN_BYTES / (1024 * 1024)
        raise ValueError(f"文件过大，超过 {mb:.0f} MB 上限")
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"文件不是有效的 UTF-8 文本: {exc}") from exc
    except OSError as exc:
        raise ValueError(f"文件读取失败: {exc}") from exc


def _upsert_file(conn, *, root: Path, path: Path, workspace_id: str, now: str) -> str:
    text = _read_markdown(path)
    rel = str(path.relative_to(root))
    event_time = _event_time(path)
    source_hash = _file_hash(workspace_id, path, text)
    metadata = {
        "library_path": str(root),
        "relative_path": rel,
        "content_sha256": _hash(text),
        "mtime": path.stat().st_mtime,
    }
    existing = conn.execute(
        "SELECT id, hash, raw_text FROM source WHERE workspace_id = ? AND kind = 'file' AND file_path = ?",
        (workspace_id, str(path)),
    ).fetchone()

    if existing:
        if existing["hash"] == source_hash and existing["raw_text"] == text:
            return "unchanged"
        source_id = existing["id"]
        conn.execute(
            "UPDATE source SET title=?, raw_text=?, hash=?, imported_at=?, event_time=?, metadata_json=? "
            "WHERE id=? AND workspace_id=?",
            (rel, text, source_hash, now, event_time, json.dumps(metadata, ensure_ascii=False), source_id, workspace_id),
        )
        result = "updated"
    else:
        source_id = new_id("src")
        conn.execute(
            "INSERT INTO source (id,kind,title,file_path,raw_text,hash,imported_at,event_time,metadata_json,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                source_id,
                "file",
                rel,
                str(path),
                text,
                source_hash,
                now,
                event_time,
                json.dumps(metadata, ensure_ascii=False),
                workspace_id,
            ),
        )
        result = "created"

    capture = conn.execute(
        "SELECT id FROM capture WHERE source_id = ? AND seq = 0",
        (source_id,),
    ).fetchone()
    if capture:
        capture_id = capture["id"]
        conn.execute(
            "UPDATE capture SET section_title=?, text=?, time_hint=?, confidence=? WHERE id=?",
            (rel, text, event_time, 1.0, capture_id),
        )
    else:
        capture_id = new_id("cap")
        conn.execute(
            "INSERT INTO capture (id,source_id,seq,section_title,text,speaker,time_hint,confidence,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (capture_id, source_id, 0, rel, text, None, event_time, 1.0, now),
        )

    evidence = conn.execute(
        "SELECT id FROM evidence WHERE workspace_id = ? AND capture_id = ?",
        (workspace_id, capture_id),
    ).fetchone()
    if evidence:
        conn.execute(
            "UPDATE evidence SET text=?, event_date=?, category=?, status=?, importance=? "
            "WHERE id=? AND workspace_id=?",
            (text, event_time, "progress", "ongoing", 0.55, evidence["id"], workspace_id),
        )
    else:
        conn.execute(
            "INSERT INTO evidence "
            "(id,capture_id,thread_id,text,event_date,owners_json,tags_json,category,status,importance,created_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (new_id("ev"), capture_id, None, text, event_time, "[]", "[]", "progress", "ongoing", 0.55, now, workspace_id),
        )
    return result


def _scan_root(conn, *, root: Path, workspace_id: str) -> dict:
    started = time.perf_counter()
    started_at = now_iso()
    result = {
        "path": str(root),
        "started_at": started_at,
        "finished_at": started_at,
        "duration_ms": 0,
        "scanned": 0,
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "removed": 0,
        "error_count": 0,
        "errors": [],
    }
    now = started_at
    paths = _iter_markdown(root)
    current_paths = {str(path) for path in paths}
    result["removed"] = _cleanup_missing_files(
        conn,
        root=root,
        current_paths=current_paths,
        workspace_id=workspace_id,
    )
    for path in paths:
        result["scanned"] += 1
        try:
            state = _upsert_file(conn, root=root, path=path, workspace_id=workspace_id, now=now)
            result[state] += 1
        except Exception as exc:  # noqa: BLE001 - keep scanning other notes.
            result["errors"].append({"path": str(path), "message": str(exc)})
    finished_at = now_iso()
    result["finished_at"] = finished_at
    result["duration_ms"] = round((time.perf_counter() - started) * 1000)
    result["error_count"] = len(result["errors"])
    _set_setting(conn, _last_scan_key(workspace_id), finished_at)
    _set_setting(conn, _last_result_key(workspace_id), json.dumps(result, ensure_ascii=False))
    return result


def scan_configured_libraries() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT key, value FROM settings WHERE key LIKE 'library.path:%'"
        ).fetchall()
        results: list[dict] = []
        for row in rows:
            workspace_id = row["key"].split(":", 1)[1]
            if workspace_id != DEFAULT_WORKSPACE_ID:
                continue
            if not _get_bool_setting(conn, _auto_scan_key(workspace_id), True):
                continue
            root = Path(row["value"]).expanduser().resolve()
            if not root.exists() or not root.is_dir():
                results.append(
                    {
                        "workspace_id": workspace_id,
                        "path": str(root),
                        "started_at": now_iso(),
                        "finished_at": now_iso(),
                        "duration_ms": 0,
                        "scanned": 0,
                        "created": 0,
                        "updated": 0,
                        "unchanged": 0,
                        "removed": 0,
                        "error_count": 1,
                        "errors": [{"path": str(root), "message": "path does not exist"}],
                    }
                )
                continue
            result = _scan_root(conn, root=root, workspace_id=workspace_id)
            result["workspace_id"] = workspace_id
            results.append(result)
        conn.commit()
        return results
    finally:
        conn.close()


@router.get("")
def get_library_status(workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        configured_path = _get_configured_path(conn, workspace_id)
        last_scan = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            (_last_scan_key(workspace_id),),
        ).fetchone()
        source_count = conn.execute(
            "SELECT COUNT(*) AS count FROM source WHERE workspace_id = ? AND kind = 'file' AND file_path IS NOT NULL",
            (workspace_id,),
        ).fetchone()["count"]
        exists = bool(configured_path and Path(configured_path).exists() and Path(configured_path).is_dir())
        auto_scan = _get_bool_setting(conn, _auto_scan_key(workspace_id), True)
        last_result = _get_json_setting(conn, _last_result_key(workspace_id))
        return {
            "path": configured_path,
            "exists": exists,
            "source_count": source_count,
            "last_scan": last_scan["value"] if last_scan else None,
            "auto_scan": auto_scan,
            "last_result": last_result,
        }
    finally:
        conn.close()


@router.post("/config")
def configure_library(body: LibraryConfigIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    root = _resolve_dir(body.path)
    conn = connect()
    try:
        _set_setting(conn, _path_key(workspace_id), str(root))
        if body.auto_scan is not None:
            _set_bool_setting(conn, _auto_scan_key(workspace_id), body.auto_scan)
        conn.commit()
        return {
            "path": str(root),
            "exists": True,
            "auto_scan": _get_bool_setting(conn, _auto_scan_key(workspace_id), True),
        }
    finally:
        conn.close()


@router.post("/scan")
def scan_library(body: LibraryScanIn | None = None, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        raw_path = body.path if body and body.path else _get_configured_path(conn, workspace_id)
        if not raw_path:
            raise HTTPException(400, "library path is not configured")
        root = _resolve_dir(raw_path)
        _set_setting(conn, _path_key(workspace_id), str(root))
        result = _scan_root(conn, root=root, workspace_id=workspace_id)
        conn.commit()
        return result
    finally:
        conn.close()


@router.post("/reveal")
def reveal_library_file(body: LibraryRevealIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        raw_root = _get_configured_path(conn, workspace_id)
        if not raw_root:
            raise HTTPException(400, "library path is not configured")
        root = _resolve_dir(raw_root)
        path = Path(body.path).expanduser().resolve()
        if not _is_inside(path, root):
            raise HTTPException(403, "file is outside the configured library")
        if not path.exists() or not path.is_file():
            raise HTTPException(404, "file not found")
        if platform.system() != "Darwin":
            raise HTTPException(400, "reveal is only supported on macOS")
        subprocess.Popen(["open", "-R", str(path)])
        return {"ok": True}
    finally:
        conn.close()
