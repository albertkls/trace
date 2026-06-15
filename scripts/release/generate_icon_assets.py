from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "icons"
PNG_PATH = ASSET_DIR / "trace-app-icon-1024.png"
SOURCE_PNG = ASSET_DIR / "spatial-slate-icon-1024.png"
ICONSET_DIR = ASSET_DIR / "Trace.iconset"
ICNS_PATH = ASSET_DIR / "Trace.icns"
FAVICON_PNG = ROOT / "frontend" / "public" / "trace-icon-512.png"

SIZE = 1024

ICONSET_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def load_source_icon() -> Image.Image:
    if not SOURCE_PNG.exists():
        raise FileNotFoundError(f"missing app icon source: {SOURCE_PNG}")
    icon = Image.open(SOURCE_PNG).convert("RGBA")
    if icon.size != (SIZE, SIZE):
        icon = icon.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return icon


def save_outputs() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    (ROOT / "frontend" / "public").mkdir(parents=True, exist_ok=True)

    icon = load_source_icon()
    icon.save(PNG_PATH)
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(FAVICON_PNG)

    if ICONSET_DIR.exists():
        for file in ICONSET_DIR.iterdir():
            file.unlink()
    else:
        ICONSET_DIR.mkdir(parents=True)

    for name, size in ICONSET_SIZES.items():
        icon.resize((size, size), Image.Resampling.LANCZOS).save(ICONSET_DIR / name)


if __name__ == "__main__":
    save_outputs()
    print(PNG_PATH)
    print(ICONSET_DIR)
    print(FAVICON_PNG)
