from __future__ import annotations

import hashlib
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import __version__
from ..config import default_data_dir
from ..db import default_db_path, ensure_schema
from ..utils import TZ

router = APIRouter(prefix="/backups", tags=["backups"])


class RestoreRequest(BaseModel):
    path: str


def backups_dir() -> Path:
    path = default_data_dir() / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now_slug() -> str:
    return datetime.now(TZ).strftime("%Y%m%d-%H%M%S")


def _sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _backup_name(label: str | None = None) -> str:
    suffix = f"-{label.strip()}" if label and label.strip() else ""
    safe_suffix = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in suffix)
    return f"Trace-backup-{_now_slug()}-v{__version__}{safe_suffix}.sqlite"


def _check_integrity(path: Path) -> None:
    try:
        conn = sqlite3.connect(path)
        try:
            row = conn.execute("PRAGMA integrity_check").fetchone()
            if not row or row[0] != "ok":
                raise HTTPException(status_code=400, detail="备份文件完整性检查失败")
        finally:
            conn.close()
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=400, detail=f"备份文件不是有效的 SQLite 数据库: {exc}")


def _resolve_backup_path(raw_path: str) -> Path:
    root = backups_dir().resolve()
    path = Path(raw_path).expanduser().resolve()
    if root not in path.parents and path != root:
        raise HTTPException(status_code=403, detail="只能恢复 Trace 备份目录内的文件")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="备份文件不存在")
    if path.suffix != ".sqlite":
        raise HTTPException(status_code=400, detail="备份文件必须是 .sqlite")
    return path


def backup_database(label: str | None = None) -> dict:
    source = default_db_path()
    if not source.exists():
        ensure_schema()
    target = backups_dir() / _backup_name(label)
    source_conn = sqlite3.connect(source)
    target_conn = sqlite3.connect(target)
    try:
        source_conn.backup(target_conn)
    finally:
        target_conn.close()
        source_conn.close()
    checksum = _sha256(target)
    return {
        "path": str(target),
        "name": target.name,
        "size": target.stat().st_size,
        "created_at": datetime.fromtimestamp(target.stat().st_mtime, TZ).isoformat(timespec="seconds"),
        "sha256": checksum,
    }


def list_backup_files() -> list[dict]:
    items = []
    for path in sorted(backups_dir().glob("*.sqlite"), key=lambda item: item.stat().st_mtime, reverse=True):
        items.append(
            {
                "path": str(path),
                "name": path.name,
                "size": path.stat().st_size,
                "created_at": datetime.fromtimestamp(path.stat().st_mtime, TZ).isoformat(timespec="seconds"),
                "sha256": _sha256(path),
            }
        )
    return items


def restore_database(raw_path: str) -> dict:
    backup_path = _resolve_backup_path(raw_path)
    _check_integrity(backup_path)
    safety_backup = backup_database("before-restore")
    db_path = default_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(backup_path, db_path)
    for suffix in ("-wal", "-shm"):
        db_path.with_name(db_path.name + suffix).unlink(missing_ok=True)
    ensure_schema()
    return {
        "ok": True,
        "restored_from": str(backup_path),
        "safety_backup": safety_backup,
    }


@router.get("")
def list_backups() -> list[dict]:
    return list_backup_files()


@router.post("", status_code=201)
def create_backup() -> dict:
    return backup_database()


@router.post("/restore")
def restore_backup(body: RestoreRequest) -> dict:
    return restore_database(body.path)
