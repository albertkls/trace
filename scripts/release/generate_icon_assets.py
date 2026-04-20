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

BG_TOP = (18, 27, 45)
BG_MID = (10, 15, 24)
BG_BOTTOM = (4, 7, 12)
PANEL_TOP = (24, 34, 52, 235)
PANEL_BOTTOM = (11, 16, 25, 250)
ACCENT = (94, 230, 197)
IRIS = (139, 149, 255)
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
        if ty < 0.52:
            base = mix(BG_TOP, BG_MID, ty / 0.52)
        else:
            base = mix(BG_MID, BG_BOTTOM, (ty - 0.52) / 0.48)
        for x in range(size):
            dx = (x - size * 0.78) / size
            dy = (y - size * 0.18) / size
            glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) / 0.52)
            accent_mix = 0.16 * glow
            left_dx = (x - size * 0.18) / size
            left_dy = (y - size * 0.82) / size
            iris_glow = max(0.0, 1.0 - math.sqrt(left_dx * left_dx + left_dy * left_dy) / 0.54)
            iris_mix = 0.11 * iris_glow
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


def draw_trace_icon() -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    bg = gradient_background(SIZE)
    canvas.paste(bg, (0, 0), rounded_mask(SIZE, inset=64, radius=RADIUS))

    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(
        [86, 86, 938, 938],
        radius=202,
        outline=(255, 255, 255, 22),
        width=2,
    )
    canvas.alpha_composite(border)

    panel = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    panel_grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    panel_pixels = panel_grad.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = mix(PANEL_TOP, PANEL_BOTTOM, t)
        for x in range(SIZE):
            panel_pixels[x, y] = color
    panel_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(panel_mask).rounded_rectangle([170, 170, 854, 854], radius=164, fill=255)
    panel.paste(panel_grad, (0, 0), panel_mask)
    panel_overlay = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    overlay_draw = ImageDraw.Draw(panel_overlay)
    overlay_draw.rounded_rectangle([170, 170, 854, 854], radius=164, outline=(255, 255, 255, 14), width=2)
    panel.alpha_composite(panel_overlay)
    canvas.alpha_composite(panel)

    trace_mask = Image.new("L", (SIZE, SIZE), 0)
    trace_draw = ImageDraw.Draw(trace_mask)
    trace_draw.line((278, 292, 748, 292), fill=255, width=84)
    trace_draw.line((513, 292, 513, 655, 579, 776, 646, 820), fill=255, width=84, joint="curve")

    glow_mask = trace_mask.filter(ImageFilter.GaussianBlur(28))
    glow = Image.new("RGBA", (SIZE, SIZE), (122, 236, 217, 0))
    glow.putalpha(glow_mask.point(lambda p: min(255, int(p * 0.65))))
    canvas.alpha_composite(glow)

    trace_grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pixels = trace_grad.load()
    for y in range(SIZE):
        for x in range(SIZE):
            tx = (x - 220) / 560
            ty = (y - 210) / 610
            t = max(0.0, min(1.0, (tx + ty) / 2))
            if t < 0.55:
                color = mix(IRIS, (122, 233, 211), t / 0.55)
            else:
                color = mix((122, 233, 211), ACCENT, (t - 0.55) / 0.45)
            pixels[x, y] = (*color, 255)
    trace_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    trace_layer.paste(trace_grad, (0, 0), trace_mask)
    canvas.alpha_composite(trace_layer)

    accents = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(accents)
    for x, y, r, color in [
        (278, 292, 54, IRIS),
        (748, 292, 54, ACCENT),
        (646, 820, 46, ACCENT),
    ]:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, 255))
    for x, y, r in [(278, 292, 22), (748, 292, 22), (646, 820, 18)]:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*WHITE, 242))
    draw.line((250, 472, 384, 472), fill=(255, 255, 255, 16), width=10)
    draw.line((680, 620, 778, 620), fill=(255, 255, 255, 14), width=10)
    draw.line((690, 676, 760, 676), fill=(255, 255, 255, 12), width=10)
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
