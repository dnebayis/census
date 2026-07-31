"""RAO-compatible image processing for Census: 40×40, one bit per pixel.

The conversion is deliberately small and exact: one LANCZOS reduction to 36×36,
placement at y=4 on a 40×40 canvas, grayscale, one fixed threshold, and MSB-first
row-major packing. Quality analysis mirrors
``src/lib/Bitmap.sol`` and does not mutate the generated pixel art.
"""

from io import BytesIO

import numpy as np
from PIL import Image, ImageOps

from config import (
    BITMAP_BYTES,
    DENSITY_MAX,
    DENSITY_MIN,
    GRID_HEIGHT,
    GRID_WIDTH,
    PORTRAIT_SIZE,
    PORTRAIT_TOP,
    THRESHOLD,
    TOTAL_PIXELS,
    WARN_CORNER_PCT,
    WARN_ISOLATED_PCT,
    WARN_SYMMETRY,
)

GRID = GRID_WIDTH


def load_image(source) -> Image.Image:
    """Load bytes, a path, or a file-like object and honor EXIF orientation."""
    if isinstance(source, bytes):
        image = Image.open(BytesIO(source))
    else:
        image = Image.open(source)
    return ImageOps.exif_transpose(image)


def resize_to_grid(image: Image.Image) -> Image.Image:
    """Reduce once, reserving a four-pixel top margin and anchoring the bottom."""
    image = image.convert("RGB")
    portrait = image.resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (GRID_WIDTH, GRID_HEIGHT), "white")
    left = (GRID_WIDTH - PORTRAIT_SIZE) // 2
    canvas.paste(portrait, (left, PORTRAIT_TOP))
    return canvas


def threshold_binarize(gray: Image.Image) -> np.ndarray:
    """Values at or below the configured threshold become foreground 1."""
    values = np.asarray(gray, dtype=np.uint8)
    return (values <= THRESHOLD).astype(np.uint8).reshape(-1)


def pack_bitmap(pixels) -> bytes:
    """Pack 1600 binary pixels into 200 bytes, MSB-first and row-major."""
    pixels = np.asarray(pixels, dtype=np.uint8).reshape(-1)
    if pixels.size != TOTAL_PIXELS:
        raise ValueError(f"expected {TOTAL_PIXELS} pixels, got {pixels.size}")
    if np.any(pixels > 1):
        raise ValueError("1-bit pixels must be 0 or 1")

    bitmap = bytearray(BITMAP_BYTES)
    for index, pixel in enumerate(pixels):
        if pixel:
            bitmap[index >> 3] |= 1 << (7 - (index & 7))
    return bytes(bitmap)


def unpack_bitmap(bitmap: bytes) -> np.ndarray:
    if len(bitmap) != BITMAP_BYTES:
        raise ValueError(f"expected {BITMAP_BYTES} bytes, got {len(bitmap)}")
    return np.array(
        [(bitmap[index >> 3] >> (7 - (index & 7))) & 1 for index in range(TOTAL_PIXELS)],
        dtype=np.uint8,
    )


def density(pixels) -> int:
    return int(np.count_nonzero(np.asarray(pixels)))


def signature(pixels) -> int:
    grid = np.asarray(pixels).reshape(GRID, GRID) != 0
    result = 0
    for block_row in range(8):
        for block_col in range(8):
            block = grid[
                block_row * 5 : block_row * 5 + 5,
                block_col * 5 : block_col * 5 + 5,
            ]
            if block.sum() >= 13:
                result |= 1 << (block_row * 8 + block_col)
    return result


def symmetry_distance(value: int) -> int:
    return sum(
        ((value >> (row * 8 + col)) & 1)
        != ((value >> (row * 8 + 7 - col)) & 1)
        for row in range(8)
        for col in range(4)
    )


def corner_density(pixels):
    grid = np.asarray(pixels).reshape(GRID, GRID) != 0
    return int(grid[:8, :8].sum()), int(grid[:8, -8:].sum())


def isolated_count(pixels) -> int:
    grid = np.asarray(pixels).reshape(GRID, GRID) != 0
    neighbors = np.zeros_like(grid, dtype=np.uint8)
    neighbors[1:, :] += grid[:-1, :]
    neighbors[:-1, :] += grid[1:, :]
    neighbors[:, 1:] += grid[:, :-1]
    neighbors[:, :-1] += grid[:, 1:]
    return int((grid & (neighbors == 0)).sum())


def preview(pixels) -> str:
    grid = np.asarray(pixels).reshape(GRID, GRID)
    return "\n".join("".join("#" if value else " " for value in row) for row in grid)


def analyse(pixels) -> dict:
    lit = density(pixels)
    sig = signature(pixels)
    top_left, top_right = corner_density(pixels)
    stats = {
        "density": lit,
        "density_pct": round(lit * 100 / TOTAL_PIXELS, 1),
        "isolated_pct": round(isolated_count(pixels) * 100 / max(lit, 1), 1),
        "symmetry": symmetry_distance(sig),
        "corner_tl_pct": round(top_left * 100 / 64, 1),
        "corner_tr_pct": round(top_right * 100 / 64, 1),
        "signature": f"0x{sig:016x}",
        "mintable": DENSITY_MIN <= lit <= DENSITY_MAX,
    }
    warnings = []
    if stats["isolated_pct"] > WARN_ISOLATED_PCT:
        warnings.append("noisy — isolated pixels")
    if stats["symmetry"] > WARN_SYMMETRY:
        warnings.append("asymmetric — not front facing?")
    if max(stats["corner_tl_pct"], stats["corner_tr_pct"]) > WARN_CORNER_PCT:
        warnings.append("crowded top corner — framing")
    stats["warnings"] = warnings
    return stats


def binarize_image(source):
    """Load → direct resize → grayscale → fixed threshold → pack."""
    resized = resize_to_grid(load_image(source)).convert("L")
    pixels = threshold_binarize(resized)
    bitmap = pack_bitmap(pixels)
    return bitmap, pixels, analyse(pixels)
