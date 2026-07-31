"""Output: save the bitmap, traits, preview and stats for one entry.

Adapted from Basies. Same two jobs — write a token, reload what already exists so a
batch stays unique — with three changes:

  - `.bin` becomes `.hex`, because what you actually do next is paste it into a
    `cast send` as calldata.
  - A `.png` preview is written, because at 40×40 you want to look at it before paying.
  - `.traits` holds readable JSON, not a packed byte string: the contract stores traits
    as ERC-8048 keys, so there is nothing to pack, and the names are what built the
    prompt in the first place.
"""

import json
import os
from io import BytesIO
from pathlib import Path

from PIL import Image

from binarize import unpack_bitmap
from config import BITMAP_BYTES, GRID_WIDTH, GRID_HEIGHT
from traits import to_indices, validate_traits

# Tone -> RGB, matching Art.sol's palette so the preview looks like what the chain renders.
PALETTE = {0: (255, 255, 255), 1: (212, 212, 212), 2: (122, 122, 122), 3: (20, 20, 20)}


def to_image(pixels, scale: int = 16) -> Image.Image:
    """Pixels -> a nearest-neighbour upscale, in the palette the chain renders."""
    img = Image.new("RGB", (GRID_WIDTH, GRID_HEIGHT))
    img.putdata([PALETTE[int(t)] for t in pixels])
    return img.resize((GRID_WIDTH * scale, GRID_HEIGHT * scale), Image.Resampling.NEAREST)


def save_preview(pixels, path: str, scale: int = 16) -> str:
    to_image(pixels, scale).save(path)
    return path


def save_comparison(pixels, source_image: bytes, path: str, scale: int = 12) -> str:
    """What the LLM drew beside what will actually be minted.

    Worth writing every time: at 40x40 the interesting question is never "is the source
    good" but "did anything survive", and the two side by side answer it instantly.
    """
    result = to_image(pixels, scale)
    h = result.height

    src = Image.open(BytesIO(source_image)).convert("RGB")
    src.thumbnail((h, h), Image.Resampling.LANCZOS)
    left = Image.new("RGB", (h, h), (255, 255, 255))
    left.paste(src, ((h - src.width) // 2, (h - src.height) // 2))

    gap = 12
    sheet = Image.new("RGB", (h * 2 + gap, h), (245, 245, 245))
    sheet.paste(left, (0, 0))
    sheet.paste(result, (h + gap, 0))
    sheet.save(path)
    return path


def save_contact_sheet(output_dir: str, path: str = None, cols: int = 5,
                       scale: int = 4, pad: int = 8) -> str:
    """A grid of every entry generated so far.

    The single most useful artefact in the directory: ten thousand entries only work as
    a collection if they read as one next to each other, and that is not visible one
    file at a time.
    """
    files = sorted(Path(output_dir).glob("*.hex"),
                   key=lambda p: int(p.stem) if p.stem.isdigit() else 0)
    if not files:
        raise ValueError(f"no .hex files in {output_dir}")

    tiles = []
    for f in files:
        bitmap = bytes.fromhex(f.read_text().strip())
        tiles.append((f.stem, to_image(unpack_bitmap(bitmap), scale)))

    tw = th = GRID_WIDTH * scale
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new(
        "RGB",
        (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad),
        (245, 245, 245),
    )
    for i, (_, img) in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(img, (pad + c * (tw + pad), pad + r * (th + pad)))

    path = path or os.path.join(output_dir, "contact.png")
    sheet.save(path)
    return path


def save_token(
    output_dir: str,
    token_id: int,
    bitmap: bytes,
    pixels,
    traits: dict,
    stats: dict,
    source_image: bytes = None,
) -> dict:
    """Write one entry's files.

    Creates:
      {tokenId}.hex      — 400-byte bitmap as hex, ready as mint calldata
      {tokenId}.png      — 640×640 nearest-neighbour preview
      {tokenId}.traits   — trait names and indices, JSON
      {tokenId}.json     — density, signature, warnings
      {tokenId}.src.png  — what the LLM drew, before binarising (when generated)

    Raises:
        ValueError: if the bitmap is the wrong length or the traits are not legal.
    """
    if len(bitmap) != BITMAP_BYTES:
        raise ValueError(f"bitmap must be exactly {BITMAP_BYTES} bytes, got {len(bitmap)}")
    if not validate_traits(traits):
        raise ValueError(f"invalid traits: {traits}")

    os.makedirs(output_dir, exist_ok=True)
    base = os.path.join(output_dir, str(token_id))

    with open(base + ".hex", "w") as f:
        f.write(bitmap.hex())

    save_preview(pixels, base + ".png")

    with open(base + ".traits", "w") as f:
        json.dump({"traits": traits, "indices": list(to_indices(traits))}, f, indent=2)

    with open(base + ".json", "w") as f:
        json.dump({"token_id": token_id, "bytes": len(bitmap), **stats}, f, indent=2)

    if source_image:
        with open(base + ".src.png", "wb") as f:
            f.write(source_image)
        try:
            save_comparison(pixels, source_image, base + ".compare.png")
        except Exception:
            pass  # a preview failing must never lose an otherwise good entry

    return {"hex": base + ".hex", "png": base + ".png", "traits": base + ".traits"}


def load_existing_traits(output_dir: str) -> set:
    """Reload trait index tuples already used, so a batch never draws a duplicate."""
    existing = set()
    path = Path(output_dir)
    if not path.exists():
        return existing

    for f in path.glob("*.traits"):
        try:
            data = json.loads(f.read_text())
            idx = data.get("indices")
            if idx:
                existing.add(tuple(idx))
        except (ValueError, OSError):
            continue

    return existing


def load_existing_signatures(output_dir: str) -> set:
    """Reload 8×8 signatures already produced.

    The contract rejects a duplicate signature outright, so catching it here saves a
    reverted transaction — two different trait sets can still land on the same coarse
    silhouette.
    """
    sigs = set()
    path = Path(output_dir)
    if not path.exists():
        return sigs

    for f in path.glob("*.json"):
        try:
            sig = json.loads(f.read_text()).get("signature")
            if sig:
                sigs.add(sig)
        except (ValueError, OSError):
            continue

    return sigs
