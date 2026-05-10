from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import __version__

router = APIRouter(prefix="/updater", tags=["updater"])

GITHUB_REPO = "albertkls/trace"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"


class DownloadRequest(BaseModel):
    dmg_url: str


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
    }


@router.post("/download")
def download_update(body: DownloadRequest) -> dict:
    dmg_url = body.dmg_url
    if "github.com" not in dmg_url:
        raise HTTPException(status_code=400, detail="仅支持从 GitHub 下载")

    update_dir = Path(tempfile.gettempdir()) / "trace-update"
    update_dir.mkdir(parents=True, exist_ok=True)

    filename = dmg_url.rsplit("/", 1)[-1]
    dmg_path = update_dir / filename

    try:
        with httpx.stream("GET", dmg_url, timeout=300, follow_redirects=True) as resp:
            resp.raise_for_status()
            with open(dmg_path, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=65536):
                    f.write(chunk)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"下载失败: {e}")

    return {"dmg_path": str(dmg_path)}


@router.post("/apply")
def apply_update(body: ApplyRequest) -> dict:
    dmg_path = body.dmg_path
    if not Path(dmg_path).is_file():
        raise HTTPException(status_code=400, detail="DMG 文件不存在")

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

DMG_PATH="{dmg_path}"
APP_PATH="{app_path}"
MOUNT_POINT="/Volumes/TraceUpdater"

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
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    exit 1
fi

# Backup old app
BACKUP="/tmp/trace-update/Trace-backup.app"
rm -rf "$BACKUP"
cp -R "$APP_PATH" "$BACKUP" 2>/dev/null || true

# Replace
rm -rf "$APP_PATH"
cp -R "$NEW_APP" "$APP_PATH"

# Unmount
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

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

    return {"ok": True}
