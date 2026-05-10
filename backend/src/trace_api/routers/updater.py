from __future__ import annotations

import hashlib
import os
import re
import shlex
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import __version__
from .backups import backup_database

router = APIRouter(prefix="/updater", tags=["updater"])

GITHUB_REPO = "albertkls/trace"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
MAX_DMG_BYTES = 1024 * 1024 * 1024
DMG_NAME_RE = re.compile(r"^Trace-\d+\.\d+\.\d+-macOS\.dmg$")
SHA256_RE = re.compile(r"^[a-fA-F0-9]{64}$")


class DownloadRequest(BaseModel):
    dmg_url: str
    expected_sha256: str | None = Field(default=None, min_length=64, max_length=71)


class ApplyRequest(BaseModel):
    dmg_path: str


def _parse_version(tag: str) -> tuple[int, ...]:
    m = re.match(r"v?(\d+)\.(\d+)\.(\d+)", tag)
    if not m:
        return (0,)
    return tuple(int(x) for x in m.groups())


def _get_app_path() -> str | None:
    """Return the enclosing .app bundle path, or None if not inside one."""
    try:
        from Foundation import NSBundle
        bundle_path = NSBundle.mainBundle().bundlePath()
        if bundle_path and bundle_path.endswith(".app"):
            return str(bundle_path)
    except Exception:
        pass

    import sys
    p = Path(sys.executable).resolve()
    while p != p.parent:
        if p.suffix == ".app":
            return str(p)
        p = p.parent
    return None


def _find_dmg_asset(release: dict) -> dict | None:
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if name.endswith(".dmg") and "macOS" in name:
            return asset
    return None


def _asset_sha256(asset: dict | None) -> str | None:
    if not asset:
        return None
    digest = asset.get("digest")
    if isinstance(digest, str) and digest.startswith("sha256:"):
        value = digest.removeprefix("sha256:")
        if SHA256_RE.match(value):
            return value.lower()
    return None


def _validate_release_dmg_url(dmg_url: str) -> str:
    parsed = urlparse(dmg_url)
    path = unquote(parsed.path)
    if parsed.scheme != "https" or parsed.netloc != "github.com":
        raise HTTPException(status_code=400, detail="仅支持 Trace GitHub Release 的 HTTPS 下载")
    if not path.startswith(f"/{GITHUB_REPO}/releases/download/"):
        raise HTTPException(status_code=400, detail="下载地址不是 Trace 官方 Release 资源")
    filename = path.rsplit("/", 1)[-1]
    if not DMG_NAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Release 资源文件名不符合 Trace macOS DMG 规范")
    return filename


def _normalize_expected_sha256(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.removeprefix("sha256:").lower()
    if not SHA256_RE.match(normalized):
        raise HTTPException(status_code=400, detail="SHA256 校验值格式不正确")
    return normalized


def _validate_update_dmg_path(dmg_path: str) -> Path:
    update_dir = (Path(tempfile.gettempdir()) / "trace-update").resolve()
    path = Path(dmg_path).expanduser().resolve()
    if update_dir not in path.parents:
        raise HTTPException(status_code=400, detail="DMG 必须位于 Trace 更新缓存目录")
    if not DMG_NAME_RE.match(path.name):
        raise HTTPException(status_code=400, detail="DMG 文件名不符合 Trace macOS DMG 规范")
    if not path.is_file():
        raise HTTPException(status_code=400, detail="DMG 文件不存在")
    return path


def _quit_app_after_response(delay: float = 0.75) -> None:
    def quit_later() -> None:
        time.sleep(delay)
        os._exit(0)

    threading.Thread(target=quit_later, daemon=True).start()


@router.get("/check")
def check_update() -> dict:
    current = _parse_version(__version__)
    try:
        resp = httpx.get(GITHUB_API, timeout=10, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"GitHub API 请求失败: {e}")

    release = resp.json()
    tag = release.get("tag_name", "")
    latest = _parse_version(tag)
    dmg_asset = _find_dmg_asset(release)

    return {
        "current_version": __version__,
        "latest_version": tag.lstrip("v"),
        "update_available": latest > current,
        "release_url": release.get("html_url"),
        "changelog": release.get("body", ""),
        "published_at": release.get("published_at"),
        "dmg_url": dmg_asset["browser_download_url"] if dmg_asset else None,
        "dmg_size": dmg_asset["size"] if dmg_asset else None,
        "dmg_sha256": _asset_sha256(dmg_asset),
    }


@router.post("/download")
def download_update(body: DownloadRequest) -> dict:
    filename = _validate_release_dmg_url(body.dmg_url)
    expected_sha256 = _normalize_expected_sha256(body.expected_sha256)

    update_dir = Path(tempfile.gettempdir()) / "trace-update"
    update_dir.mkdir(parents=True, exist_ok=True)

    dmg_path = update_dir / filename
    hasher = hashlib.sha256()
    total = 0

    try:
        with httpx.stream("GET", body.dmg_url, timeout=300, follow_redirects=True) as resp:
            resp.raise_for_status()
            with open(dmg_path, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=65536):
                    total += len(chunk)
                    if total > MAX_DMG_BYTES:
                        raise HTTPException(status_code=400, detail="DMG 文件过大，已中止下载")
                    hasher.update(chunk)
                    f.write(chunk)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"下载失败: {e}")

    actual_sha256 = hasher.hexdigest()
    if expected_sha256 and actual_sha256 != expected_sha256:
        dmg_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="DMG SHA256 校验失败")

    return {"dmg_path": str(dmg_path), "sha256": actual_sha256}


@router.post("/apply")
def apply_update(body: ApplyRequest) -> dict:
    dmg_path = _validate_update_dmg_path(body.dmg_path)
    backup_database("before-update")

    app_path = _get_app_path()
    if not app_path:
        raise HTTPException(
            status_code=400,
            detail="当前不在 .app 环境中，无法执行自动更新",
        )

    update_dir = Path(tempfile.gettempdir()) / "trace-update"
    update_dir.mkdir(parents=True, exist_ok=True)
    script_path = update_dir / "apply-update.sh"

    script_content = f"""#!/bin/bash
set -e

DMG_PATH={shlex.quote(str(dmg_path))}
APP_PATH={shlex.quote(app_path)}
MOUNT_POINT="$(mktemp -d /tmp/trace-update-mount.XXXXXX)"
cleanup() {{
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    rmdir "$MOUNT_POINT" 2>/dev/null || true
}}
trap cleanup EXIT

# Wait for the app process to exit
sleep 3

# Retry: wait until .app is no longer locked
for i in $(seq 1 10); do
    if ! lsof "$APP_PATH" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Attach DMG
hdiutil attach "$DMG_PATH" -nobrowse -mountpoint "$MOUNT_POINT" -quiet

# Find .app inside mounted DMG
NEW_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1)
if [ -z "$NEW_APP" ]; then
    echo "ERROR: DMG 中未找到 .app"
    exit 1
fi

# Backup old app
BACKUP="/tmp/trace-update/Trace-backup.app"
rm -rf "$BACKUP"
cp -R "$APP_PATH" "$BACKUP" 2>/dev/null || true

# Replace
rm -rf "$APP_PATH"
cp -R "$NEW_APP" "$APP_PATH"

# Remove quarantine
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

# Clean up
rm -f "$DMG_PATH"
rm -f "{script_path}"

# Relaunch
open "$APP_PATH"
"""

    script_path.write_text(script_content)
    script_path.chmod(0o755)

    subprocess.Popen(
        ["bash", str(script_path)],
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _quit_app_after_response()

    return {"ok": True}
