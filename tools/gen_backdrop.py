#!/usr/bin/env python3
"""Painted TV-studio backdrop for the stage (sits behind the gold pill).

Soft-focus wide shot: blue-violet wall, out-of-focus bokeh set lights,
subtle beams, a glossy floor with smeared reflections, cyan stage line,
near-black bottom edge. Deterministic. numpy + PIL only.

Usage: python3 tools/gen_backdrop.py
"""

import os

import numpy as np

from PIL import Image

W, H = 2048, 1024
SEED = 7
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "docs", "assets", "textures", "studio_backdrop.png")

rng = np.random.default_rng(SEED)


def fft_blur(a, sy, sx):
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.rfftfreq(a.shape[1])[None, :]
    g = np.exp(-2.0 * (np.pi * fy * sy) ** 2) * np.exp(-2.0 * (np.pi * fx * sx) ** 2)
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def add_disc(img, cx, cy, r, color, gain):
    """Soft gaussian bokeh disc, drawn only in a local window."""
    x0, x1 = max(0, int(cx - 3 * r)), min(W, int(cx + 3 * r) + 1)
    y0, y1 = max(0, int(cy - 3 * r)), min(H, int(cy + 3 * r) + 1)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    # bokeh: bright plateau with soft gaussian skirt
    core = np.exp(-0.5 * d2 / (r * r))
    plateau = 1.0 / (1.0 + (d2 / (r * r)) ** 3)
    disc = (0.55 * core + 0.45 * plateau) * gain
    for c in range(3):
        img[y0:y1, x0:x1, c] += disc * color[c]


def main():
    yy, xx = np.mgrid[0:H, 0:W]
    u = xx / (W - 1)
    v = yy / (H - 1)
    img = np.zeros((H, W, 3))

    stage = 0.68  # stage line (fraction of height)

    # --- Wall: blue-violet gradient, brighter mid-left / mid-right ---
    base_top = np.array([10.0, 8.0, 34.0])
    base_mid = np.array([26.0, 24.0, 78.0])
    wall = base_top[None, None, :] + (base_mid - base_top)[None, None, :] * \
        (v[..., None] / stage).clip(0, 1)
    lobe = (np.exp(-((u - 0.22) ** 2) / 0.03) +
            np.exp(-((u - 0.78) ** 2) / 0.03))
    wall += np.array([14.0, 12.0, 40.0])[None, None, :] * \
        (lobe * (1.0 - np.abs(v / stage - 0.45)).clip(0, 1))[..., None]
    # large-scale color variation
    for tint, s in [((8, 4, 22), 260.0), ((4, 8, 26), 140.0)]:
        n = fft_blur(rng.standard_normal((H, W)), s, s)
        n = n / max(np.abs(n).max(), 1e-9)
        wall += np.array(tint)[None, None, :] * n[..., None]
    img += wall

    # --- Bokeh set lights: warm amber + cool cyan clusters ---
    warm = [(255, 190, 110), (255, 160, 80), (255, 214, 150)]
    cool = [(110, 220, 255), (80, 170, 255), (150, 235, 255)]
    for side in (0.16, 0.84):
        for i in range(45):
            cx = (side + rng.normal(0, 0.09)) * W
            cy = (0.16 + abs(rng.normal(0, 0.16))) * H
            if cy > stage * H * 0.92:
                continue
            r = rng.uniform(8, 40)
            pal = warm if rng.random() < 0.55 else cool
            color = np.array(pal[rng.integers(0, 3)]) / 255.0
            corner_boost = 1.0 + 0.8 * (1.0 - cy / (stage * H))
            gain = rng.uniform(10, 34) * corner_boost / (r ** 0.5)
            add_disc(img, cx, cy, r, color * 255.0, gain / 255.0 * 14)

    # --- Soft diagonal beams from the top corners ---
    for (ox, slope, tint) in [(0.02, 0.55, (60, 40, 110)),
                              (0.98, -0.55, (40, 50, 120)),
                              (0.1, 0.8, (50, 30, 90)),
                              (0.9, -0.8, (30, 45, 100))]:
        d = (u - ox) * slope - (v - 0.0)
        beam = np.exp(-(d ** 2) / 0.004)
        img += np.array(tint)[None, None, :] * (beam * 0.09)[..., None] * \
            (1.0 - v[..., None] / stage).clip(0, 1)

    # blur the wall region softly (depth of field)
    for c in range(3):
        img[..., c] = fft_blur(img[..., c], 3.0, 3.0)

    # --- Floor: mirrored, smeared, dark ---
    line = int(stage * H)
    floor_h = H - line
    src = img[line - floor_h:line][::-1].copy()  # mirror of wall above
    # vertical smear via repeated blur
    for c in range(3):
        src[..., c] = fft_blur(src[..., c], 14.0, 2.0)
    depth = (np.arange(floor_h) / floor_h)[:, None, None]
    floor = src * (0.30 * (1.0 - depth) ** 1.6)
    floor += np.array([3.0, 4.0, 10.0])[None, None, :] * (1.0 - depth * 0.4)
    img[line:] = floor

    # --- Cyan stage-line glow ---
    glow = np.exp(-((yy - line) ** 2) / (2 * 6.0 ** 2))
    img += np.array([40.0, 140.0, 180.0])[None, None, :] * glow[..., None] * 0.55
    wide = np.exp(-((yy - line) ** 2) / (2 * 30.0 ** 2))
    img += np.array([15.0, 50.0, 70.0])[None, None, :] * wide[..., None] * 0.4

    # --- Vignette + near-black bottom edge ---
    vig = 1.0 - 0.55 * ((u - 0.5) ** 2 * 2.6 + (v - 0.42) ** 2 * 1.8)
    img *= vig.clip(0.25, 1.0)[..., None]
    bottom = ((v - 0.9) / 0.1).clip(0, 1)
    img = img * (1.0 - bottom[..., None]) + \
        np.array([2.0, 3.0, 8.0])[None, None, :] * bottom[..., None]

    # dither to kill banding
    img += rng.uniform(-1.2, 1.2, img.shape)

    out = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGB").save(OUT, optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
