#!/usr/bin/env python3
"""Create Android/Chrome-compatible PWA icons with only Python's standard library.
No external font or image binary assets are required.
Run: python3 tools/generate_icons.py
"""
from pathlib import Path
from math import hypot
from struct import pack
import zlib

OUTPUT = Path(__file__).resolve().parent.parent / "icons"


def segment_distance(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    ux, uy = x - a[0], y - a[1]
    t = max(0.0, min(1.0, (ux * vx + uy * vy) / (vx * vx + vy * vy)))
    return hypot(x - a[0] - t * vx, y - a[1] - t * vy)


def pixel(x, y):
    # Coordinates normalized to 512x512 and reserved maskable icon safe-zone.
    margin, radius = 12, 112
    cx = min(max(x, margin + radius), 500 - radius)
    cy = min(max(y, margin + radius), 500 - radius)
    if hypot(x - cx, y - cy) > radius:
        return (0, 0, 0, 0)
    grad = (x + y) / 1024
    bg = (int(17 - grad * 10), int(57 - grad * 34), int(91 - grad * 46), 255)
    # Thick cobalt / ivory W strokes; gold slash in front.
    path = [((93, 156), (148, 361)), ((148, 361), (223, 223)), ((223, 223), (292, 361)), ((292, 361), (350, 156))]
    if any(segment_distance(x, y, a, b) < 17.5 for a, b in path):
        bg = (239, 245, 251, 255)
    if segment_distance(x, y, (390, 152), (292, 370)) < 16:
        bg = (225, 186, 110, 255)
    if 408 <= y <= 420 and 125 <= x <= 389:
        bg = (92, 148, 181, 255)
    return bg


def chunk(label, data):
    return pack("!I", len(data)) + label + data + pack("!I", zlib.crc32(label + data) & 0xFFFFFFFF)


def write_icon(size):
    lines = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(pixel((x + .5) * 512 / size, (y + .5) * 512 / size))
        lines.append(bytes(row))
    compressed = zlib.compress(b"".join(lines), level=9)
    output = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", pack("!2I5B", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )
    destination = OUTPUT / f"icon-{size}.png"
    destination.write_bytes(output)
    print(f"{destination}: {len(output):,} bytes")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        write_icon(size)


if __name__ == "__main__":
    main()
