#!/usr/bin/env python3
"""Generate a Census-format bitmap: 40x40, 1 bit per pixel, row-major, MSB-first.

Exercises the bitmap format end to end with a deterministic portrait.

Values: 0 background, 1 foreground.
Usage: make_bitmap.py [seed] -> 400 hex chars on stdout
"""
import sys

DIM = 40


def build(seed: int) -> list[int]:
    px = [0] * (DIM * DIM)

    def put(r, c, tone):
        if 0 <= r < DIM and 0 <= c < DIM:
            px[r * DIM + c] = tone

    cx = 19.5
    # skull: filled ellipse
    head_cy, head_ry, head_rx = 17.0, 11.0, 9.0
    for r in range(DIM):
        for c in range(DIM):
            d = ((c - cx) / head_rx) ** 2 + ((r - head_cy) / head_ry) ** 2
            if d <= 1.0:
                put(r, c, 1)

    # shoulders: a wide arc anchored at the bottom edge
    for r in range(28, DIM):
        half = 6 + (r - 28) * 1.9
        for c in range(int(cx - half), int(cx + half) + 1):
            if 0 <= c < DIM:
            put(r, c, 1)

    # neck
    for r in range(26, 31):
        for c in range(17, 23):
            put(r, c, 1)

    # eyes — seed shifts them so every run yields a different signature
    eye_r = 16 + (seed % 3)
    for dc in (-5, 4):
        for rr in range(eye_r, eye_r + 2):
            for cc in range(int(cx + dc), int(cx + dc) + 3):
                put(rr, cc, 1)

    # brow, varies with seed
    brow_r = eye_r - 2 - (seed >> 2) % 2
    for dc in (-6, 3):
        for cc in range(int(cx + dc), int(cx + dc) + 4):
            put(brow_r, cc, 1)

    # mouth
    for cc in range(16, 24):
        put(eye_r + 6, cc, 1)

    # cheek marks
    for r in range(eye_r + 1, eye_r + 6):
        for c in (int(cx - 8), int(cx + 7)):
            put(r, c, 1)

    # seed marks in the top band: guarantees signature uniqueness across runs
    for i in range(8):
        if (seed >> i) & 1:
            for rr in range(0, 4):
                for cc in range(i * 5, i * 5 + 4):
                    put(rr, cc, 1)

    return px


def pack(px: list[int]) -> bytes:
    out = bytearray(200)
    for i, value in enumerate(px):
        out[i >> 3] |= (value & 1) << (7 - (i & 7))
    return bytes(out)


def signature(px: list[int]) -> int:
    sig = 0
    for br in range(8):
        for bc in range(8):
            n = sum(
                1
                for r in range(5)
                for c in range(5)
                if px[(br * 5 + r) * DIM + bc * 5 + c] != 0
            )
            if n >= 13:
                sig |= 1 << (br * 8 + bc)
    return sig


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    px = build(seed)
    lit = sum(1 for t in px if t)
    print(pack(px).hex())
    print(
        f"lit={lit} ({lit*100//1600}%)  sig=0x{signature(px):016x}",
        file=sys.stderr,
    )
