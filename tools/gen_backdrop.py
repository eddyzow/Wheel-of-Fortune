#!/usr/bin/env python3
"""Painted TV-studio backdrop — recognizable set architecture, rendered
sharp at high resolution: glowing light columns with fixture casings,
metallic gold trim rails, paneled blue wall, corner sunburst fans,
overhead rig lamps, and a glossy reflecting floor.

Only the light GLOWS are soft; the structure stays crisp.
Deterministic. numpy + PIL only.  Usage: python3 tools/gen_backdrop.py
"""

import os

import numpy as np

from PIL import Image

W, H = 2560, 1280
SEED = 7
STAGE = 0.66
TRIM_TOP = 0.15
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "docs", "assets", "textures", "studio_backdrop.png")

rng = np.random.default_rng(SEED)

yy, xx = np.mgrid[0:H, 0:W]
u = xx / (W - 1)
v = yy / (H - 1)


def fft_blur(a, sy, sx):
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.rfftfreq(a.shape[1])[None, :]
    g = np.exp(-2.0 * (np.pi * fy * sy) ** 2) * np.exp(-2.0 * (np.pi * fx * sx) ** 2)
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


COLS = [(0.05, (110, 235, 255)), (0.165, (210, 130, 255)),
        (0.29, (110, 235, 255)), (0.71, (110, 235, 255)),
        (0.835, (210, 130, 255)), (0.95, (110, 235, 255))]

col_zone = smoothstep(TRIM_TOP + 0.008, TRIM_TOP + 0.04, v) * \
    (1.0 - smoothstep(STAGE - 0.025, STAGE - 0.004, v))


def build_soft():
    """Wall base + all light glows (gets a gentle blur)."""
    img = np.zeros((H, W, 3))

    # Paneled blue wall
    wt = smoothstep(TRIM_TOP, STAGE, v)
    img += (np.array([13.0, 19.0, 55.0])[None, None, :] +
            np.array([18.0, 24.0, 52.0])[None, None, :] * wt[..., None])
    sheen = np.exp(-((v - 0.40) ** 2) / 0.014)
    img += np.array([9.0, 13.0, 28.0])[None, None, :] * sheen[..., None]

    # Corner gold sunburst fans (behind the columns)
    for cx0, cy0 in [(0.0, 0.13), (1.0, 0.13)]:
        du = (u - cx0) * (W / H)
        dv = v - cy0
        rad = np.sqrt(du * du + dv * dv)
        ang = np.arctan2(dv, du)
        rays = 0.5 + 0.5 * np.tanh(2.5 * np.sin(ang * 26.0))
        fan = (0.35 + 0.65 * rays) * (1.0 - smoothstep(0.28, 0.62, rad)) * \
            smoothstep(TRIM_TOP - 0.01, TRIM_TOP + 0.03, v) * \
            (1.0 - smoothstep(STAGE - 0.06, STAGE, v))
        img += np.array([64.0, 46.0, 14.0])[None, None, :] * fan[..., None]

    # Column glows
    for cx, tint in COLS:
        d = np.abs(u - cx)
        core = np.exp(-(d ** 2) / (2 * 0.004 ** 2))
        halo = np.exp(-(d ** 2) / (2 * 0.018 ** 2))
        glow = (1.15 * core + 0.45 * halo) * col_zone
        img += np.array(tint)[None, None, :] * glow[..., None]

    # Rig lamp cones onto the wall
    for i in range(9):
        lx = 0.08 + 0.84 * i / 8.0
        prog = np.clip((v - TRIM_TOP) / (STAGE - TRIM_TOP), 0, 1)
        cone_w = 0.013 + 0.085 * prog
        cone = np.exp(-((u - lx) ** 2) / (2 * cone_w ** 2)) * prog ** 0.5 * \
            (1.0 - smoothstep(STAGE - 0.05, STAGE, v)) * \
            smoothstep(TRIM_TOP, TRIM_TOP + 0.02, v)
        img += np.array([66.0, 74.0, 108.0])[None, None, :] * cone[..., None] * 0.15

    for c in range(3):
        img[..., c] = fft_blur(img[..., c], 2.2, 2.2)
    return img


def main():
    img = build_soft()

    # ---------- CRISP structure on top ----------
    # Wall panel seams (sharp, subtle)
    seam = np.abs(((u * 18.0) % 1.0) - 0.5)
    wall_mask = smoothstep(TRIM_TOP, TRIM_TOP + 0.01, v) * (1.0 - smoothstep(STAGE - 0.01, STAGE, v))
    img *= (1.0 - 0.14 * smoothstep(0.465, 0.5, seam) * wall_mask)[..., None]

    # Column fixture casings: sharp dark edges + a crisp bright core line
    for cx, tint in COLS:
        d = np.abs(u - cx)
        casing = smoothstep(0.0075, 0.009, d) * (1.0 - smoothstep(0.0105, 0.012, d))
        img *= (1.0 - 0.6 * (casing * col_zone)[..., None])
        core = 1.0 - smoothstep(0.0012, 0.002, d)
        img += (np.array(tint) * 0.5 + np.array([128.0, 128.0, 128.0]))[None, None, :] * \
            (core * col_zone)[..., None] * 0.8

    # Metallic gold trim rails (crisp, with specular)
    deep_gold = np.array([110.0, 78.0, 22.0])
    bright_gold = np.array([246.0, 202.0, 104.0])
    for band_y, band_h in [(TRIM_TOP, 0.016), (STAGE - 0.010, 0.012)]:
        inband = smoothstep(band_y - band_h, band_y - band_h + 0.003, v) * \
            (1.0 - smoothstep(band_y + band_h - 0.003, band_y + band_h, v))
        gt = np.clip((v - (band_y - band_h)) / (2 * band_h), 0, 1)
        band_col = bright_gold[None, None, :] + \
            (deep_gold - bright_gold)[None, None, :] * gt[..., None]
        spec = np.exp(-((gt - 0.22) ** 2) / 0.02)
        band_col += np.array([255.0, 246.0, 214.0])[None, None, :] * spec[..., None] * 0.5
        img = img * (1.0 - inband[..., None]) + band_col * inband[..., None]

    # Overhead rig zone: near-black with crisp lamps
    rig = 1.0 - smoothstep(TRIM_TOP - 0.02, TRIM_TOP - 0.004, v)
    img *= (1.0 - 0.86 * rig)[..., None]
    for i in range(9):
        lx = 0.08 + 0.84 * i / 8.0
        d2 = ((u - lx) ** 2) * (W / H) ** 2 + (v - TRIM_TOP + 0.05) ** 2
        lamp = np.exp(-d2 / (2 * 0.006 ** 2))
        glow = np.exp(-d2 / (2 * 0.02 ** 2))
        img += np.array([255.0, 228.0, 170.0])[None, None, :] * lamp[..., None]
        img += np.array([200.0, 175.0, 120.0])[None, None, :] * glow[..., None] * 0.35

    # ---------- Stage line ----------
    line = int(STAGE * H)
    glow = np.exp(-((yy - line) ** 2) / (2 * 5.0 ** 2))
    img += np.array([55.0, 170.0, 210.0])[None, None, :] * glow[..., None] * 0.6
    wide = np.exp(-((yy - line) ** 2) / (2 * 30.0 ** 2))
    img += np.array([16.0, 55.0, 75.0])[None, None, :] * wide[..., None] * 0.35

    # ---------- Floor: smeared reflection of the set ----------
    floor_h = H - line
    src = img[line - floor_h:line][::-1].copy()
    for c in range(3):
        src[..., c] = fft_blur(src[..., c], 12.0, 1.6)
    depth = (np.arange(floor_h) / floor_h)[:, None, None]
    img[line:] = src * (0.36 * (1.0 - depth) ** 1.5) + \
        np.array([4.0, 5.0, 12.0])[None, None, :] * (1.0 - depth * 0.5)

    # ---------- Finishing ----------
    vig = 1.0 - 0.48 * ((u - 0.5) ** 2 * 2.2 + (v - 0.40) ** 2 * 1.5)
    img *= vig.clip(0.32, 1.0)[..., None]
    bottom = smoothstep(0.90, 1.0, v)
    img = img * (1.0 - bottom[..., None]) + \
        np.array([2.0, 3.0, 8.0])[None, None, :] * bottom[..., None]
    img += rng.uniform(-1.2, 1.2, img.shape)

    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(OUT, optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
