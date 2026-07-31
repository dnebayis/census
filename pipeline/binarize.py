"""Image processing: resize to 40×40, convert to a two-bit Census bitmap.

Adapted from Basies. Same shape — load, resize, grayscale, quantise, pack — but three
steps changed, and each one is the difference between a portrait and mud at this size.

  1. Two-stage downscale. Basies did `resize((40,40), LANCZOS)` in one jump. LANCZOS
     rings, and ringing quantises into halos and speckle. Here it goes to 320 first,
     then a BOX area filter does the last step.

  2. Crop to the subject. Generators leave a lot of empty background; spending pixels
     on nothing is unaffordable when there are only 1600 of them.

  3. Four tone levels instead of one threshold, split by percentile of the lit pixels'
     own distribution. Fixed cut points fail on any source whose contrast differs from
     what you assumed. Percentiles guarantee real blacks whatever comes in.

Also here: the bitmap analysis the contract performs, so the pipeline can check its own
output before spending gas. These mirror src/lib/Bitmap.sol — if they ever disagree,
the mint reverts.
"""

from io import BytesIO

import numpy as np
from PIL import Image, ImageOps, ImageFilter

from config import (
    GRID_WIDTH, GRID_HEIGHT, TOTAL_PIXELS, BITMAP_BYTES, INTERMEDIATE,
    TONE_BG, TONE_LIGHT, TONE_MID, TONE_INK, TONE_SPLIT, BG_CUT_RANGE,
    TARGET_DENSITY, DENSITY_MIN, DENSITY_MAX,
    WARN_SYMMETRY, WARN_CORNER_PCT, WARN_ISOLATED_PCT, WARN_FULLINK_PCT,
)

GRID = GRID_WIDTH


# ---------------------------------------------------------------- load / resize


def load_image(source) -> Image.Image:
    """Load an image from bytes, a file path, or a file-like object."""
    if isinstance(source, bytes):
        return Image.open(BytesIO(source))
    return Image.open(source)


def to_grayscale(img: Image.Image) -> Image.Image:
    return img.convert("L")


def trim_to_subject(img: Image.Image, bg_cut: int = 238, pad: float = 0.06) -> Image.Image:
    """Crop to what is actually drawn, then pad back to a square."""
    mask = img.point(lambda v: 255 if v < bg_cut else 0)
    box = mask.getbbox()
    if box:
        span = max(box[2] - box[0], box[3] - box[1])
        p = int(span * pad)
        box = (max(0, box[0] - p), max(0, box[1] - p),
               min(img.width, box[2] + p), min(img.height, box[3] + p))
        img = img.crop(box)

    side = max(img.size)
    square = Image.new("L", (side, side), 255)
    square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return square


def resize_to_grid(img: Image.Image) -> Image.Image:
    """Two-stage reduction: LANCZOS to an intermediate, then a BOX area filter to 40×40."""
    img = img.resize((INTERMEDIATE, INTERMEDIATE), Image.Resampling.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=3))
    return img.resize((GRID_WIDTH, GRID_HEIGHT), Image.Resampling.BOX)


# ---------------------------------------------------------------- quantise


def quantize_tones(gray: np.ndarray, bg_cut: int) -> np.ndarray:
    """Four-level quantisation.

    `bg_cut` separates subject from background and is the only knob the sweep turns.
    The three ink levels are then split by percentile, so a washed-out source and a
    heavy one both end up using the full tonal range.
    """
    flat = gray.reshape(-1)
    lit = flat[flat <= bg_cut]
    if lit.size == 0:
        return np.zeros_like(flat, dtype=np.uint8)

    p_ink, p_mid = np.quantile(lit, TONE_SPLIT)

    out = np.full(flat.shape, TONE_LIGHT, dtype=np.uint8)
    out[flat > bg_cut] = TONE_BG
    out[(flat <= bg_cut) & (flat <= p_mid)] = TONE_MID
    out[(flat <= bg_cut) & (flat <= p_ink)] = TONE_INK
    return out


def despeckle(px: np.ndarray) -> np.ndarray:
    """Drop lit pixels with no lit orthogonal neighbour, then fill single-pixel holes.

    Targets the contract's isolation warning directly, and is what separates a drawing
    from dithering noise at 40×40.
    """
    g = px.reshape(GRID, GRID).copy()
    lit = g > 0

    neigh = np.zeros_like(lit, dtype=np.uint8)
    neigh[1:, :] += lit[:-1, :]
    neigh[:-1, :] += lit[1:, :]
    neigh[:, 1:] += lit[:, :-1]
    neigh[:, :-1] += lit[:, 1:]

    g[lit & (neigh == 0)] = TONE_BG

    lit2 = g > 0
    neigh2 = np.zeros_like(lit2, dtype=np.uint8)
    neigh2[1:, :] += lit2[:-1, :]
    neigh2[:-1, :] += lit2[1:, :]
    neigh2[:, 1:] += lit2[:, :-1]
    neigh2[:, :-1] += lit2[:, 1:]

    g[(~lit2) & (neigh2 >= 3)] = TONE_MID
    return g.reshape(-1)


# ---------------------------------------------------------------- pack


def pack_bitmap(px) -> bytes:
    """Pack 1600 tone values into 400 bytes, MSB-first, row-major.

    Four pixels per byte at two bits each, so a row is exactly 10 bytes and no pixel
    straddles a row boundary.
    """
    px = np.asarray(px, dtype=np.uint8).reshape(-1)
    if px.size != TOTAL_PIXELS:
        raise ValueError(f"expected {TOTAL_PIXELS} pixels, got {px.size}")

    out = bytearray(BITMAP_BYTES)
    for i, tone in enumerate(px):
        out[i >> 2] |= (int(tone) & 3) << (6 - ((i & 3) << 1))
    return bytes(out)


def unpack_bitmap(bm: bytes) -> np.ndarray:
    if len(bm) != BITMAP_BYTES:
        raise ValueError(f"expected {BITMAP_BYTES} bytes, got {len(bm)}")
    return np.array(
        [(bm[i >> 2] >> (6 - ((i & 3) << 1))) & 3 for i in range(TOTAL_PIXELS)],
        dtype=np.uint8,
    )


# ---------------------------------------------------------------- analysis
#
# Mirrors src/lib/Bitmap.sol. The contract runs the same checks; running them here
# first is what keeps a mint from reverting.


def density(px) -> int:
    return int(np.count_nonzero(np.asarray(px)))


def full_ink(px) -> int:
    return int(np.count_nonzero(np.asarray(px) == TONE_INK))


def signature(px) -> int:
    """The 8×8 coarse silhouette used on chain as the uniqueness key (SPEC §3.4).

    64 blocks of 5×5; a block bit is set when a majority (≥13) of its 25 pixels are lit.
    """
    g = np.asarray(px).reshape(GRID, GRID) > 0
    sig = 0
    for br in range(8):
        for bc in range(8):
            if g[br * 5:br * 5 + 5, bc * 5:bc * 5 + 5].sum() >= 13:
                sig |= 1 << (br * 8 + bc)
    return sig


def symmetry_distance(sig: int) -> int:
    return sum(
        ((sig >> (r * 8 + c)) & 1) != ((sig >> (r * 8 + 7 - c)) & 1)
        for r in range(8) for c in range(4)
    )


def corner_density(px):
    g = np.asarray(px).reshape(GRID, GRID) > 0
    return int(g[:8, :8].sum()), int(g[:8, -8:].sum())


def isolated_count(px) -> int:
    g = np.asarray(px).reshape(GRID, GRID) > 0
    n = np.zeros_like(g, dtype=np.uint8)
    n[1:, :] += g[:-1, :]
    n[:-1, :] += g[1:, :]
    n[:, 1:] += g[:, :-1]
    n[:, :-1] += g[:, 1:]
    return int((g & (n == 0)).sum())


def preview(px) -> str:
    """ASCII render, for eyeballing before spending gas."""
    ramp = " .:#"
    g = np.asarray(px).reshape(GRID, GRID)
    return "\n".join("".join(ramp[int(v)] for v in row) for row in g)


def analyse(px) -> dict:
    d = density(px)
    sig = signature(px)
    tl, tr = corner_density(px)
    stats = {
        "density": d,
        "density_pct": round(d * 100 / TOTAL_PIXELS, 1),
        "full_ink_pct": round(full_ink(px) * 100 / max(d, 1), 1),
        "isolated_pct": round(isolated_count(px) * 100 / max(d, 1), 1),
        "symmetry": symmetry_distance(sig),
        "corner_tl_pct": round(tl * 100 / 64, 1),
        "corner_tr_pct": round(tr * 100 / 64, 1),
        "signature": f"0x{sig:016x}",
        "mintable": DENSITY_MIN <= d <= DENSITY_MAX,
    }
    warnings = []
    if stats["full_ink_pct"] < WARN_FULLINK_PCT:
        warnings.append("flat tone — too little full ink")
    if stats["isolated_pct"] > WARN_ISOLATED_PCT:
        warnings.append("noisy — isolated pixels")
    if stats["symmetry"] > WARN_SYMMETRY:
        warnings.append("asymmetric — not front facing?")
    if max(stats["corner_tl_pct"], stats["corner_tr_pct"]) > WARN_CORNER_PCT:
        warnings.append("crowded top corner — framing")
    stats["warnings"] = warnings
    return stats


# ---------------------------------------------------------------- entry point


def binarize_image(source):
    """Full pipeline: load → grayscale → trim → resize → quantise → despeckle → pack.

    Sweeps `bg_cut` and keeps whichever result lands nearest the middle of the target
    density band, so a source that is too pale or too heavy is corrected here rather
    than reverting on chain.

    Returns:
        (bitmap_bytes, pixels, stats)
    """
    img = trim_to_subject(to_grayscale(load_image(source)))
    img = ImageOps.autocontrast(img, cutoff=1)
    gray = np.asarray(resize_to_grid(img), dtype=np.int16)

    lo, hi = TARGET_DENSITY
    mid = (lo + hi) // 2
    best_px, best_score = None, None

    for cut in range(BG_CUT_RANGE[0], BG_CUT_RANGE[1] + 1, 2):
        px = despeckle(quantize_tones(gray, cut))
        score = abs(density(px) - mid)
        if best_score is None or score < best_score:
            best_px, best_score = px, score

    bitmap = pack_bitmap(best_px)
    assert len(bitmap) == BITMAP_BYTES, f"bitmap must be {BITMAP_BYTES} bytes"
    return bitmap, best_px, analyse(best_px)
