"""Generate PWA PNG icons from icons/icon.svg. Run: python scripts/generate-icons.py"""
import struct
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "icons" / "icon.svg"
OUT = ROOT / "icons"


def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)


def write_png(path, size, rgba_rows):
    raw = b"".join(b"\x00" + rgba_rows[y] for y in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = b"".join([
        b"\x89PNG\r\n\x1a\n",
        png_chunk(b"IHDR", ihdr),
        png_chunk(b"IDAT", zlib.compress(raw, 9)),
        png_chunk(b"IEND", b""),
    ])
    path.write_bytes(data)


def render_icon(size):
    bg = (236, 239, 244, 255)      # Nord snow storm #eceff4
    gold = (94, 129, 172, 255)     # Nord frost blue #5e81ac
    border = (94, 129, 172, 255)
    rows = []
    margin = int(size * 0.08)
    for y in range(size):
        row = bytearray(size * 4)
        for x in range(size):
            i = x * 4
            on_border = margin <= x < size - margin and (y < margin + 2 or y >= size - margin - 2 or x < margin + 2 or x >= size - margin - 2)
            cx, cy = size // 2, int(size * 0.56)
            dx = abs(x - cx) / (size * 0.22)
            dy = abs(y - cy) / (size * 0.28)
            in_m = dx + dy < 1.0 and y > size * 0.22 and y < size * 0.78 and abs(x - cx) < size * 0.18
            if in_m:
                row[i:i+4] = bytes(gold)
            elif on_border:
                row[i:i+4] = bytes(border)
            else:
                row[i:i+4] = bytes(bg)
        rows.append(bytes(row))
    return rows


def main():
    for size in (192, 512):
        write_png(OUT / f"icon-{size}.png", size, render_icon(size))
    print("Generated icons/icon-192.png and icons/icon-512.png")


if __name__ == "__main__":
    main()