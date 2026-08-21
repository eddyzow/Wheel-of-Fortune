#!/usr/bin/env python3
"""Procedural PBR texture pack generator for the Wheel of Fortune web game.

Deterministic (seeded RNG), no network access. Writes PNGs + a contact sheet
to docs/assets/textures/.

Albedo maps carry visible character; normal + roughness maps are what make
surfaces respond to light (the part that actually reads as "textured").

Usage: python3 tools/gen_textures.py
"""

import os

import numpy as np
from PIL import Image

SEED = 42
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "docs", "assets", "textures")

rng = np.random.default_rng(SEED)


# ---------------------------------------------------------------- helpers

def fft_gauss_blur(a, sigma_y, sigma_x):
    """Periodic (wrap-around) gaussian blur via FFT -> seamlessly tileable."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    gy = np.exp(-2.0 * (np.pi * fy * sigma_y) ** 2)
    gx = np.exp(-2.0 * (np.pi * fx * sigma_x) ** 2)
    return np.fft.irfft2(np.fft.rfft2(a) * gy * gx, s=(h, w))


def normalized(a):
    a = a - a.mean()
    s = a.std()
    return a / s if s > 0 else a


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def save_rgb(name, r, g, b):
    img = np.stack([r, g, b], axis=-1)
    img = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGB").save(os.path.join(OUT_DIR, name), optimize=True)


def save_rgba(name, r, g, b, a):
    img = np.stack([r, g, b, a], axis=-1)
    img = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(OUT_DIR, name), optimize=True)


def save_gray(name, v):
    img = np.clip(v, 0, 255).astype(np.uint8)
    Image.fromarray(img, "L").save(os.path.join(OUT_DIR, name), optimize=True)


def height_to_normal(name, height, strength, wrap=True):
    """OpenGL-convention (three.js) tangent-space normal map from a height field."""
    if wrap:
        dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
        dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    else:
        dx = np.zeros_like(height)
        dy = np.zeros_like(height)
        dx[:, 1:-1] = (height[:, 2:] - height[:, :-2]) * 0.5
        dy[1:-1, :] = (height[2:, :] - height[:-2, :]) * 0.5
    nx = -dx * strength
    ny = dy * strength  # +Y up (GL): image rows go down, so flip
    nz = np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    save_rgb(name,
             (nx * inv * 0.5 + 0.5) * 255.0,
             (ny * inv * 0.5 + 0.5) * 255.0,
             (nz * inv * 0.5 + 0.5) * 255.0)


# ---------------------------------------------------------------- textures

def gen_brushed_metal():
    """Tileable horizontally brushed stainless steel: albedo + groove normals."""
    n = 1024
    base = np.array([185.0, 192.0, 204.0])  # #b9c0cc

    streaks = normalized(fft_gauss_blur(rng.standard_normal((n, n)), 0.6, 45.0))
    bands = normalized(fft_gauss_blur(rng.standard_normal((n, n)), 14.0, 220.0))
    spark_src = rng.standard_normal((n, n))
    spark = fft_gauss_blur(np.maximum(spark_src - 2.2, 0.0), 0.5, 60.0)
    spark = spark / max(spark.max(), 1e-9)

    lum = 14.0 * streaks - 8.0 * np.maximum(bands, 0.0) + 34.0 * spark
    scale = np.array([1.00, 1.00, 1.04])
    save_rgb("brushed_metal.png",
             base[0] + lum * scale[0],
             base[1] + lum * scale[1],
             base[2] + lum * scale[2])

    # Micro-grooves: the streak field is row-correlated, so its vertical
    # gradient gives long horizontal scratches in the normal map.
    height = 1.5 * streaks + 0.8 * bands
    height_to_normal("brushed_normal.png", height, 2.2)


def gen_panel_green():
    """Tileable kelly-green show panel (board surround) with metal-flake
    sparkle. Emits albedo, normal, and roughness maps — the flakes are tiny
    low-roughness pits that glint as the camera sways.
    """
    n = 1024
    base = np.array([21.0, 112.0, 52.0])  # rich kelly green

    mottle = (1.00 * normalized(fft_gauss_blur(rng.standard_normal((n, n)), 160.0, 160.0)) +
              0.50 * normalized(fft_gauss_blur(rng.standard_normal((n, n)), 64.0, 64.0)) +
              0.25 * normalized(fft_gauss_blur(rng.standard_normal((n, n)), 24.0, 24.0)))
    mottle = normalized(mottle)
    grain = normalized(fft_gauss_blur(rng.standard_normal((n, n)), 0.7, 0.7))

    yy, xx = np.mgrid[0:n, 0:n]
    sheen = np.sin(2.0 * np.pi * 3.0 * (xx + yy) / n)

    # Metal-flake sparkle: sparse bright specks, 1-2px.
    fleck_mask = rng.random((n, n)) > 0.9975
    flecks = fft_gauss_blur(fleck_mask.astype(float), 0.55, 0.55)
    flecks = flecks / max(flecks.max(), 1e-9)

    factor = 1.0 + 0.045 * mottle + 0.02 * grain + 0.03 * sheen
    factor = np.clip(factor, 0.88, 1.12)

    r = base[0] * factor + 70.0 * flecks
    g = base[1] * factor + 78.0 * flecks
    b = base[2] * factor + 72.0 * flecks
    save_rgb("panel_green.png", r, g, b)

    # Normals: broad waviness + orange-peel micro bump.
    height = 2.2 * mottle + 0.5 * grain
    height_to_normal("panel_normal.png", height, 2.6)

    # Roughness: mid-rough paint, flecks nearly mirror-smooth.
    rough = 150.0 + 22.0 * mottle - 235.0 * flecks
    save_gray("panel_rough.png", rough)


def gen_radial_brushed():
    """RGBA spun-metal disc with concentric brushing + starburst."""
    n = 1024
    c = (n - 1) / 2.0
    yy, xx = np.mgrid[0:n, 0:n]
    dx, dy = xx - c, yy - c
    rad = np.sqrt(dx * dx + dy * dy)
    theta = np.arctan2(dy, dx)

    base = np.array([206.0, 199.0, 183.0])

    prof_res = 4096
    prof = rng.standard_normal(prof_res)
    k = np.exp(-0.5 * (np.arange(-6, 7) / 1.4) ** 2)
    prof = np.convolve(prof, k / k.sum(), mode="same")
    prof = (prof - prof.mean()) / prof.std()
    idx = np.clip(rad * (prof_res / (n * 0.75)), 0, prof_res - 2)
    i0 = idx.astype(int)
    fr = idx - i0
    rings = prof[i0] * (1.0 - fr) + prof[i0 + 1] * fr

    ang_noise = normalized(fft_gauss_blur(rng.standard_normal((n, n)), 30.0, 30.0))
    star = (0.5 + 0.5 * np.cos(5.0 * theta + 0.7)) ** 3.0
    star *= smoothstep(30.0, 200.0, rad) * (1.0 - smoothstep(320.0, 500.0, rad))
    shade = 1.0 + 0.10 * (1.0 - smoothstep(0.0, 460.0, rad)) - 0.08 * smoothstep(300.0, 500.0, rad)

    lum = 13.0 * rings + 5.0 * ang_noise + 40.0 * star
    r = base[0] * shade + lum * 1.02
    g = base[1] * shade + lum * 1.00
    b = base[2] * shade + lum * 0.94

    alpha = 255.0 * (1.0 - smoothstep(497.0, 503.0, rad))
    save_rgba("radial_brushed.png", r, g, b, alpha)


def _tile_edge_sdf(w, h, corner):
    """Distance inside a rounded-rect (positive inside, 0 at border)."""
    px = np.abs(np.arange(w)[None, :] - (w - 1) / 2.0)
    py = np.abs(np.arange(h)[:, None] - (h - 1) / 2.0)
    qx = px - (w / 2.0 - corner)
    qy = py - (h / 2.0 - corner)
    outside = np.sqrt(np.maximum(qx, 0.0) ** 2 + np.maximum(qy, 0.0) ** 2)
    sdf = outside + np.minimum(np.maximum(qx, qy), 0.0) - corner
    return -sdf


def gen_tile_face():
    """Off-white glossy tile face + a beveled-edge normal map.

    The bevel normal is what makes each tile catch light along its border
    and read as a physical card instead of a flat quad.
    """
    w, h = 512, 640
    base = np.array([242.0, 244.0, 238.0])

    grain = normalized(fft_gauss_blur(rng.standard_normal((h, w)), 22.0, 0.7))
    lacquer = normalized(fft_gauss_blur(rng.standard_normal((h, w)), 0.6, 18.0))
    y = np.linspace(0.0, 1.0, h)[:, None] * np.ones((1, w))
    grad = 8.0 * (0.5 - y)

    inside = _tile_edge_sdf(w, h, 26.0)
    vignette = 16.0 * (1.0 - smoothstep(0.0, 16.0, inside))

    lum = 2.2 * grain + 1.4 * lacquer + grad - vignette
    save_rgb("tile_face.png", base[0] + lum, base[1] + lum, base[2] + lum)

    # Bevel: edges slope in over ~14px; faint convex dome across the face.
    xs = np.linspace(-1.0, 1.0, w)[None, :]
    ys = np.linspace(-1.0, 1.0, h)[:, None]
    dome = 3.0 * (1.0 - 0.5 * (xs ** 2 + ys ** 2))
    bevel = 10.0 * smoothstep(0.0, 14.0, inside)
    height = bevel + dome + 0.25 * grain
    height_to_normal("tile_normal.png", height, 1.6, wrap=False)


def gen_tile_empty():
    """Green 'unused' tile card, matching the modern show board: mid-green
    card, darker rounded border, and a lighter-green sunburst medallion
    emblem in the center."""
    w, h = 512, 640
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0

    card = np.array([24.0, 116.0, 48.0])     # card green (rich, show-like)
    border = np.array([8.0, 54.0, 24.0])     # dark border green
    emblem = np.array([92.0, 196.0, 106.0])  # light printed emblem green

    yy, xx = np.mgrid[0:h, 0:w]
    dx, dy = xx - cx, yy - cy
    rad = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)

    # Card with subtle mottle
    mottle = normalized(fft_gauss_blur(rng.standard_normal((h, w)), 40.0, 40.0))
    grain = normalized(fft_gauss_blur(rng.standard_normal((h, w)), 0.8, 0.8))
    col = card[None, None, :] * (1.0 + 0.06 * mottle + 0.02 * grain)[..., None]

    # Darker border band inside the card edge (rounded rect)
    inside = _tile_edge_sdf(w, h, 34.0)
    border_mask = 1.0 - smoothstep(16.0, 34.0, inside)
    col = col * (1.0 - border_mask[..., None]) + border[None, None, :] * border_mask[..., None]

    # Printed sunburst emblem — crisp mandala: center dot, sharp rings,
    # petal dots, and radiating tick marks (reads as print, not mush).
    medallion = np.zeros((h, w))

    def dot(bx, by, radius):
        d = np.sqrt((xx - bx) ** 2 + (yy - by) ** 2)
        return 1.0 - smoothstep(radius - 1.5, radius + 1.5, d)

    def ring(radius, thickness):
        return (1.0 - smoothstep(radius + thickness / 2 - 1.5,
                                 radius + thickness / 2 + 1.5, rad)) * \
               smoothstep(radius - thickness / 2 - 1.5,
                          radius - thickness / 2 + 1.5, rad)

    medallion += dot(cx, cy, 13.0)
    medallion += ring(30.0, 4.5)
    for i in range(10):
        a = 2.0 * np.pi * i / 10
        medallion += dot(cx + 52.0 * np.cos(a), cy + 52.0 * np.sin(a), 7.5)
    medallion += ring(76.0, 3.5)
    for i in range(18):
        a = 2.0 * np.pi * i / 18 + 0.17
        medallion += dot(cx + 98.0 * np.cos(a), cy + 98.0 * np.sin(a), 6.0)
    # Radiating tick marks
    ticks = (0.5 + 0.5 * np.cos(24.0 * ang)) ** 14 * \
        smoothstep(114.0, 120.0, rad) * (1.0 - smoothstep(146.0, 152.0, rad))
    medallion += ticks
    medallion = np.clip(medallion, 0.0, 1.0)
    medallion *= 1.0 - border_mask  # keep it off the border

    col = col * (1.0 - 0.85 * medallion[..., None]) + \
        emblem[None, None, :] * (0.85 * medallion[..., None])

    # Gentle top-lit gradient
    shade = 1.0 + 0.06 * (0.5 - yy / h)
    col = col * shade[..., None]

    save_rgb("tile_empty.png", col[..., 0], col[..., 1], col[..., 2])

    # Emboss: bevel edge + slightly raised medallion print
    bevel = 10.0 * smoothstep(0.0, 14.0, inside)
    height = bevel + 1.8 * medallion + 0.3 * grain
    height_to_normal("tile_empty_normal.png", height, 1.6, wrap=False)


def gen_wheel_grain():
    """RGBA radial-fiber grain overlay for the wheel face (subtle)."""
    n = 1024
    c = (n - 1) / 2.0
    yy, xx = np.mgrid[0:n, 0:n]
    dx, dy = xx - c, yy - c
    rad = np.sqrt(dx * dx + dy * dy)
    theta = np.arctan2(dy, dx)

    # Fibers radiating from the hub: angularly-correlated 1D noise.
    prof_res = 8192
    prof = rng.standard_normal(prof_res)
    k = np.exp(-0.5 * (np.arange(-4, 5) / 1.1) ** 2)
    prof = np.convolve(prof, k / k.sum(), mode="same")
    prof = (prof - prof.mean()) / prof.std()
    idx = ((theta + np.pi) / (2 * np.pi) * (prof_res - 1)).astype(int)
    fibers = prof[idx]

    speckle = normalized(fft_gauss_blur(rng.standard_normal((n, n)), 0.6, 0.6))
    v = 0.75 * fibers + 0.45 * speckle

    lum = 128.0 + v * 60.0
    fade = smoothstep(90.0, 200.0, rad) * (1.0 - smoothstep(430.0, 505.0, rad))
    alpha = 26.0 * fade  # ~10% overlay at most
    save_rgba("wheel_grain.png", lum, lum, lum, alpha)


def gen_gold_sunburst():
    """RGBA gold 'pill' set piece behind the board — a bright gold stadium
    ring with radial fins inside it and a dark center, like the show's
    surround. Normalized capsule distance: 1.0 at the pill edge."""
    w, h = 2048, 1024
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    yy, xx = np.mgrid[0:h, 0:w]

    # Capsule (stadium) SDF: horizontal segment + radius
    # seg + rad must stay inside the image half-width (w/2 = 2·h), or the
    # capsule's rounded ends get flat-cut by the texture border.
    seg = w * 0.27           # half-length of the straight section
    rad = h * 0.45           # capsule radius  (0.27·w + 0.45·h = 0.995·w/2)
    qx = np.maximum(np.abs(xx - cx) - seg, 0.0)
    d = np.sqrt(qx * qx + (yy - cy) ** 2) / rad  # 1.0 at edge

    ang = np.arctan2(yy - cy, xx - cx)

    deep = np.array([88.0, 58.0, 12.0])
    bright = np.array([240.0, 198.0, 100.0])
    glint = np.array([255.0, 244.0, 208.0])
    col = np.zeros((h, w, 3))

    # Polished-metal specular sweeps: broad highlights fixed in "world"
    # light directions (upper-left and lower-right), like studio key lights.
    def wrap(a):
        return np.mod(a + np.pi, 2.0 * np.pi) - np.pi
    sweep = (1.0 +
             0.55 * np.exp(-wrap(ang + 2.35) ** 2 / 0.22) +
             0.35 * np.exp(-wrap(ang - 0.75) ** 2 / 0.30))

    # --- Solid gold band at the rim: smooth vertical metal gradient ---
    band = smoothstep(0.845, 0.858, d) * (1.0 - smoothstep(0.996, 1.008, d))
    vpos = np.clip((cy - yy) / (h * 0.5), -1.0, 1.0)  # +1 top, -1 bottom
    band_t = np.clip(0.62 + 0.30 * vpos, 0.0, 1.0)
    band_col = (deep[None, None, :] +
                (bright - deep)[None, None, :] * band_t[..., None]) * sweep[..., None]
    # Bright keyline on the band's inner edge, dark line on the outer edge
    keyline = smoothstep(0.852, 0.858, d) * (1.0 - smoothstep(0.868, 0.882, d))
    band_col += glint[None, None, :] * 0.5 * (keyline * sweep)[..., None]
    outer_dark = smoothstep(0.975, 0.998, d)
    band_col *= (1.0 - 0.45 * outer_dark)[..., None]

    # --- Machined louver fins: each fin has a lit face and a shadow face ---
    NFINS = 56
    f = np.mod(ang / (2.0 * np.pi) * NFINS, 1.0)
    fin_shade = 0.30 + 0.58 * (1.0 - f)          # sawtooth: bright -> dark
    seam = 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.05, f))  # dark seam line
    fins_zone = smoothstep(0.34, 0.40, d) * (1.0 - smoothstep(0.83, 0.85, d))
    fin_t = np.clip(fin_shade * seam, 0.0, 1.0)
    fin_col = (deep[None, None, :] +
               (bright - deep)[None, None, :] * fin_t[..., None]) * \
        (0.8 * sweep[..., None])
    # Fins brighten as they approach the band (catching the rim light)
    fin_col *= (0.75 + 0.4 * smoothstep(0.45, 0.83, d))[..., None]

    # --- Near-black center backing (board covers most of it) ---
    center = 1.0 - smoothstep(0.32, 0.38, d)
    center_col = np.array([4.0, 5.0, 10.0])[None, None, :] * np.ones((h, w, 1))

    col += band_col * band[..., None]
    col += fin_col * fins_zone[..., None]
    col += center_col * center[..., None]

    alpha = 255.0 * (1.0 - smoothstep(1.0, 1.015, d))
    save_rgba("gold_sunburst.png", col[..., 0], col[..., 1], col[..., 2], alpha)


def gen_bulb_glow():
    """RGBA warm-white gaussian glow sprite, transparent edges."""
    n = 256
    c = (n - 1) / 2.0
    yy, xx = np.mgrid[0:n, 0:n]
    rad = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)

    sigma = 46.0
    g = np.exp(-0.5 * (rad / sigma) ** 2)
    cut = np.exp(-0.5 * (c / sigma) ** 2)
    a = np.clip((g - cut) / (1.0 - cut), 0.0, 1.0)
    alpha = 255.0 * a

    warm = np.array([255.0, 214.0, 160.0])
    white = np.array([255.0, 248.0, 236.0])
    t = a ** 0.6
    save_rgba("bulb_glow.png",
              warm[0] + (white[0] - warm[0]) * t,
              warm[1] + (white[1] - warm[1]) * t,
              warm[2] + (white[2] - warm[2]) * t,
              alpha)


# ---------------------------------------------------------------- preview

def gen_preview():
    names = ["brushed_metal.png", "brushed_normal.png", "panel_green.png",
             "panel_normal.png", "panel_rough.png", "radial_brushed.png",
             "tile_face.png", "tile_normal.png", "tile_empty.png",
             "tile_empty_normal.png", "gold_sunburst.png", "wheel_grain.png",
             "bulb_glow.png"]
    imgs = [Image.open(os.path.join(OUT_DIR, f)) for f in names]

    pad = 16
    height = max(i.height for i in imgs) + 2 * pad
    width = sum(i.width for i in imgs) + pad * (len(imgs) + 1)
    sheet = Image.new("RGB", (width, height), (58, 58, 62))

    x = pad
    for img in imgs:
        y = (height - img.height) // 2
        if img.mode == "RGBA":
            sheet.paste(img, (x, y), img)
        else:
            sheet.paste(img.convert("RGB"), (x, y))
        x += img.width + pad
    sheet.save(os.path.join(OUT_DIR, "_preview.jpg"), quality=70)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    gen_brushed_metal()
    gen_panel_green()
    gen_radial_brushed()
    gen_tile_face()
    gen_tile_empty()
    gen_gold_sunburst()
    gen_wheel_grain()
    gen_bulb_glow()
    gen_preview()

    total = 0
    for f in sorted(os.listdir(OUT_DIR)):
        size = os.path.getsize(os.path.join(OUT_DIR, f))
        total += size
        print(f"{f:24s} {size / 1024:8.1f} KB")
    print(f"{'TOTAL':24s} {total / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
