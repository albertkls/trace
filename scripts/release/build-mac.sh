#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
OUT_DIR="$ROOT/output/macos"
DMG_STAGE="$OUT_DIR/dmg-root"
PYI_BUILD_DIR="$OUT_DIR/pyinstaller-build"
PYI_DIST_DIR="$OUT_DIR/pyinstaller-dist"
PYI_SPEC_DIR="$OUT_DIR/pyinstaller-spec"
ICON_DIR="$ROOT/assets/icons"
ICONSET_DIR="$ICON_DIR/Trace.iconset"
ICNS_PATH="$ICON_DIR/Trace.icns"
PY="${PY:-python3.11}"
APP_NAME="Trace"
VENV="$BACKEND_DIR/.venv"

fail() {
  echo "✗ $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

set_or_add_plist() {
  local plist="$1"
  local key="$2"
  local type="$3"
  local value="$4"
  if /usr/libexec/PlistBuddy -c "Set :$key $value" "$plist" >/dev/null 2>&1; then
    return 0
  fi
  /usr/libexec/PlistBuddy -c "Add :$key $type $value" "$plist" >/dev/null
}

need_cmd "$PY"
need_cmd npm
need_cmd hdiutil
need_cmd /usr/libexec/PlistBuddy
need_cmd codesign
need_cmd iconutil

VERSION="$($PY - <<'PY'
import tomllib
from pathlib import Path
pyproject = Path('backend/pyproject.toml')
print(tomllib.loads(pyproject.read_text(encoding='utf-8'))['project']['version'])
PY
)"

mkdir -p "$OUT_DIR"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "◆ creating backend virtualenv"
  (cd "$BACKEND_DIR" && "$PY" -m venv .venv)
fi

echo "◆ installing backend release dependencies"
(
  cd "$BACKEND_DIR"
  "$VENV/bin/pip" install -U pip >/dev/null
  "$VENV/bin/pip" install -e '.[dev,desktop,build]' >/dev/null
)

echo "◆ installing frontend dependencies"
(cd "$FRONTEND_DIR" && npm install --silent)

echo "◆ generating app icon assets"
"$VENV/bin/python" "$ROOT/scripts/release/generate_icon_assets.py" >/dev/null
rm -f "$ICNS_PATH"
iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"

echo "◆ building frontend desktop bundle"
(
  cd "$FRONTEND_DIR"
  TRACE_RUNTIME=desktop TRACE_APP_VERSION="$VERSION" npm run build >/dev/null
)

echo "◆ packaging Trace.app with PyInstaller"
rm -rf "$DMG_STAGE" "$PYI_BUILD_DIR" "$PYI_DIST_DIR" "$PYI_SPEC_DIR"
"$VENV/bin/pyinstaller" \
  --noconfirm \
  --clean \
  --windowed \
  --name "$APP_NAME" \
  --icon "$ICNS_PATH" \
  --specpath "$PYI_SPEC_DIR" \
  --workpath "$PYI_BUILD_DIR" \
  --distpath "$PYI_DIST_DIR" \
  --paths "$BACKEND_DIR/src" \
  --collect-all webview \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --add-data "$FRONTEND_DIR/dist:frontend_dist" \
  --add-data "$BACKEND_DIR/src/trace_api/schema.sql:trace_api" \
  "$BACKEND_DIR/src/trace_api/desktop.py" >/dev/null

APP_PATH="$PYI_DIST_DIR/$APP_NAME.app"
[[ -d "$APP_PATH" ]] || fail "PyInstaller did not produce $APP_PATH"
INFO_PLIST="$APP_PATH/Contents/Info.plist"

echo "◆ stamping macOS bundle metadata"
set_or_add_plist "$INFO_PLIST" "CFBundleShortVersionString" string "$VERSION"
set_or_add_plist "$INFO_PLIST" "CFBundleVersion" string "$VERSION"
set_or_add_plist "$INFO_PLIST" "CFBundleIdentifier" string "com.albertkls.trace"
codesign --force --deep --sign - "$APP_PATH" >/dev/null

rm -rf "$OUT_DIR/$APP_NAME.app" "$OUT_DIR/${APP_NAME}-${VERSION}-macOS.dmg"
cp -R "$APP_PATH" "$OUT_DIR/"

mkdir -p "$DMG_STAGE"
cp -R "$APP_PATH" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"

DMG_PATH="$OUT_DIR/${APP_NAME}-${VERSION}-macOS.dmg"
echo "◆ building DMG installer"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

shasum -a 256 "$DMG_PATH" > "$OUT_DIR/SHA256SUMS.txt"

cat <<EOF

✓ Mac release artifacts ready:
  - $OUT_DIR/$APP_NAME.app
  - $DMG_PATH
  - $OUT_DIR/SHA256SUMS.txt

Unsigned build note:
  macOS may require right-click → Open on first launch, or removing quarantine after download.
EOF
