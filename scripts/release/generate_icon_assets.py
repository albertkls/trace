from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "icons"
PNG_PATH = ASSET_DIR / "trace-app-icon-1024.png"
ICONSET_DIR = ASSET_DIR / "Trace.iconset"
ICNS_PATH = ASSET_DIR / "Trace.icns"
FAVICON_PNG = ROOT / "frontend" / "public" / "trace-icon-512.png"

SIZE = 1024
RADIUS = 224

BG_TOP = (17, 24, 39)
BG_MID = (10, 15, 24)
BG_BOTTOM = (5, 7, 12)
PANEL = (13, 19, 29, 235)
CARD = (20, 27, 40, 255)
CARD_EDGE = (255, 255, 255, 10)
ACCENT = (94, 230, 197)
IRIS = (139, 149, 255)
CYAN = (109, 217, 230)
WHITE = (242, 248, 255)

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


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(c1: tuple[int, ...], c2: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def gradient_background(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        ty = y / (size - 1)
        if ty < 0.55:
            base = mix(BG_TOP, BG_MID, ty / 0.55)
        else:
            base = mix(BG_MID, BG_BOTTOM, (ty - 0.55) / 0.45)
        for x in range(size):
            dx = (x - size * 0.78) / size
            dy = (y - size * 0.16) / size
            accent_glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) / 0.5)
            accent_mix = 0.12 * accent_glow
            lx = (x - size * 0.18) / size
            ly = (y - size * 0.84) / size
            iris_glow = max(0.0, 1.0 - math.sqrt(lx * lx + ly * ly) / 0.52)
            iris_mix = 0.10 * iris_glow
            r = min(255, int(base[0] + ACCENT[0] * accent_mix + IRIS[0] * iris_mix))
            g = min(255, int(base[1] + ACCENT[1] * accent_mix + IRIS[1] * iris_mix))
            b = min(255, int(base[2] + ACCENT[2] * accent_mix + IRIS[2] * iris_mix))
            pixels[x, y] = (r, g, b, 255)
    return image


def rounded_mask(size: int, inset: int = 0, radius: int | None = None) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=radius if radius is not None else max(8, RADIUS - inset),
        fill=255,
    )
    return mask


def gradient_path(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            tx = (x - 224) / 556
            ty = (y - 284) / 462
            t = max(0.0, min(1.0, (tx * 0.65 + ty * 0.35)))
            if t < 0.48:
                color = mix(IRIS, CYAN, t / 0.48)
            else:
                color = mix(CYAN, ACCENT, (t - 0.48) / 0.52)
            pixels[x, y] = (*color, 255)
    return image


def draw_trace_icon() -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = gradient_background(SIZE)
    canvas.paste(bg, (0, 0), rounded_mask(SIZE, inset=64, radius=RADIUS))

    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle([104, 104, 920, 920], radius=196, outline=(255, 255, 255, 15), width=2)
    canvas.alpha_composite(border)

    panel = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([194, 194, 830, 830], radius=156, fill=PANEL, outline=(255, 255, 255, 13), width=2)
    canvas.alpha_composite(panel)

    cards = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cards_draw = ImageDraw.Draw(cards)
    for x1, y1, x2, y2 in [
        (242, 248, 474, 430),
        (548, 248, 780, 430),
        (242, 498, 474, 680),
        (548, 498, 780, 680),
    ]:
        cards_draw.rounded_rectangle([x1, y1, x2, y2], radius=40, fill=CARD, outline=CARD_EDGE, width=2)
    canvas.alpha_composite(cards)

    path_mask = Image.new("L", (SIZE, SIZE), 0)
    path_draw = ImageDraw.Draw(path_mask)
    path_draw.line((306, 342, 716, 342), fill=255, width=60)
    path_draw.line((306, 342, 306, 588, 714, 588), fill=255, width=60, joint="curve")
    path_draw.line((716, 342, 716, 588), fill=255, width=60)

    glow_mask = path_mask.filter(ImageFilter.GaussianBlur(28))
    glow = Image.new("RGBA", (SIZE, SIZE), (110, 224, 220, 0))
    glow.putalpha(glow_mask.point(lambda p: min(255, int(p * 0.62))))
    canvas.alpha_composite(glow)

    path_grad = gradient_path(SIZE)
    path_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    path_layer.paste(path_grad, (0, 0), path_mask)
    canvas.alpha_composite(path_layer)

    accents = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(accents)
    for x, y, r, color in [
        (306, 342, 34, IRIS),
        (716, 342, 34, ACCENT),
        (306, 588, 34, IRIS),
        (714, 588, 34, ACCENT),
    ]:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, 255))
    for x, y in [(306, 342), (716, 342), (306, 588), (714, 588)]:
        draw.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(*WHITE, 245))
    draw.line((286, 756, 450, 756), fill=(255, 255, 255, 16), width=12)
    draw.line((572, 756, 720, 756), fill=(255, 255, 255, 16), width=12)
    canvas.alpha_composite(accents)

    return canvas


def save_outputs() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    (ROOT / "frontend" / "public").mkdir(parents=True, exist_ok=True)

    icon = draw_trace_icon()
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
