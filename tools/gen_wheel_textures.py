#!/usr/bin/env python3
"""Create deterministic, self-contained wheel surface textures.

Requires only NumPy and Pillow.  The output textures are intentionally kept
restrained so they can be composited at low opacity in the wheel renderer.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


SIZE = 1024
CENTER = (SIZE - 1) / 2.0
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "docs/assets/textures"


def smoothstep(edge0, edge1, values):
    """A vectorized smooth interpolation constrained to [0, 1]."""
    t = np.clip((values - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def coordinates():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    dx = x - CENTER
    dy = y - CENTER
    radius = np.hypot(dx, dy)
    angle = np.arctan2(dy, dx)
    return radius, angle


def write_hub_center(radius, angle):
    """Build a teal laminate hub with gentle radial detail."""
    # #2f9377 is the reference base.  These changes remain deliberately low
    # contrast to preserve the hub's clean, show-wheel appearance.
    vignette = 1.0 - 0.18 * smoothstep(230.0, 503.0, radius)
    rings = 0.020 * np.sin(radius * 0.235) + 0.010 * np.sin(radius * 0.062)
    rays = 0.030 * np.cos(24.0 * angle + 0.16 * np.sin(radius * 0.025))
    rays *= 1.0 - 0.65 * smoothstep(80.0, 500.0, radius)
    edge_ring = -0.12 * np.exp(-((radius - 481.0) / 2.7) ** 2)
    brightness = vignette + rings + rays + edge_ring

    base = np.array([47.0, 147.0, 119.0])
    rgb = np.clip(base[None, None, :] * brightness[:, :, None], 0, 255)

    # Opaque through the specified 500 px radius, smoothly transparent at 512.
    alpha = 255.0 * (1.0 - smoothstep(500.0, 512.0, radius))
    pixels = np.dstack((rgb, alpha[:, :, None])).astype(np.uint8)
    Image.fromarray(pixels, "RGBA").save(OUTPUT_DIR / "hub_center.png", optimize=True)


def radial_point(rng, minimum=0.0, maximum=500.0, outer_bias=True):
    """Return a point in polar coordinates, biased outwards when requested."""
    if outer_bias:
        # Squared radius keeps the density per surface area natural while making
        # the intentional outer-radius concentration easy to tune.
        radial = minimum + (maximum - minimum) * rng.random() ** 0.42
    else:
        radial = minimum + (maximum - minimum) * rng.random()
    theta = rng.random() * 2.0 * np.pi
    return radial, theta


def write_wedge_print(radius):
    """Build a nearly transparent printing overlay with sparse physical detail."""
    rng = np.random.default_rng(11)
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    # Fine, bright glints: the triangular radial distribution makes them visibly
    # more common near the rim while retaining a quiet center.
    for _ in range(600):
        r, theta = radial_point(rng, 55.0, 499.0)
        x = CENTER + r * np.cos(theta)
        y = CENTER + r * np.sin(theta)
        dot_size = int(rng.integers(1, 4))
        alpha = int(rng.integers(60, 121))
        draw.ellipse((x - dot_size / 2, y - dot_size / 2,
                      x + dot_size / 2, y + dot_size / 2),
                     fill=(255, 255, 255, alpha))

    # Long, restrained radial fibers.  They are laid over the face in light and
    # dark ink-like strokes, with enough irregularity to avoid a mechanical fan.
    for _ in range(430):
        theta = rng.random() * 2.0 * np.pi
        start = rng.uniform(16.0, 235.0)
        length = rng.uniform(80.0, 300.0)
        end = min(start + length, 502.0)
        wobble = rng.normal(0.0, 0.0016)
        color = (255, 255, 255, int(rng.integers(10, 19))) if rng.random() < 0.55 else (0, 34, 30, int(rng.integers(10, 19)))
        x1 = CENTER + start * np.cos(theta - wobble)
        y1 = CENTER + start * np.sin(theta - wobble)
        x2 = CENTER + end * np.cos(theta + wobble)
        y2 = CENTER + end * np.sin(theta + wobble)
        draw.line((x1, y1, x2, y2), fill=color, width=1)

    # A low-alpha dark rim.  Blur-free falloff is compact and avoids making the
    # overlay feel like an explicit border when it is composited.
    pixels = np.asarray(image).copy()
    ring_alpha = 25.0 * smoothstep(465.0, 507.0, radius)
    ring_alpha *= 1.0 - smoothstep(507.0, 512.0, radius)
    ring = np.zeros_like(pixels)
    ring[..., 0] = 0
    ring[..., 1] = 24
    ring[..., 2] = 21
    ring[..., 3] = ring_alpha.astype(np.uint8)
    combined = Image.alpha_composite(Image.fromarray(pixels, "RGBA"), Image.fromarray(ring, "RGBA"))
    combined.save(OUTPUT_DIR / "wedge_print.png", optimize=True)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    radius, angle = coordinates()
    write_hub_center(radius, angle)
    write_wedge_print(radius)


if __name__ == "__main__":
    main()
