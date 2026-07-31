"""Trait assignment: deterministic from seed + uniqueness check.

Adapted from Basies. Same three jobs — generate, validate, serialise — with Gender
dropped (DECISIONS D12) and one addition: `describe()`, which turns a trait set into
the English clause the image prompt is built from.

That addition is the point. In Basies traits were metadata and only the character type
ever reached the generator, so every image was drawn from the same short prompt. Here
the traits are the description, so an entry's hat, eyes and expression are actually in
the picture rather than only in the JSON.

Serialisation is key-value, not a packed bytes8: the contract has an ERC-8048 store,
so there is nothing to pack.
"""

import random
from typing import Dict, Optional, Set, Tuple

from config import TRAIT_CATEGORIES, TRAIT_SKIP, MAX_RETRIES

TRAIT_KEYS = [name for name, _ in TRAIT_CATEGORIES]

TraitIndices = Tuple[int, ...]
Traits = Dict[str, str]


def generate_traits(
    seed: int,
    existing_traits: Optional[Set[TraitIndices]] = None,
    forced: Optional[Dict[str, int]] = None,
) -> Traits:
    """Pick one option per category, deterministic from `seed`, unique against `existing`.

    Args:
        seed: seeds the draw, so the same seed always yields the same character.
        existing_traits: index tuples already used, so a batch cannot draw a duplicate.
        forced: {category: option index} to pin, e.g. {"Species": 5} for a grey alien.

    Returns:
        {category: option} mapping.

    Raises:
        RuntimeError: if no unused combination is found after MAX_RETRIES attempts.
    """
    existing = existing_traits if existing_traits is not None else set()
    forced = forced or {}

    for attempt in range(MAX_RETRIES):
        rng = random.Random(seed + attempt * 7919)
        idx = []
        for name, options in TRAIT_CATEGORIES:
            idx.append(forced[name] if name in forced else rng.randrange(len(options)))
        combo = tuple(idx)

        if combo in existing:
            continue
        existing.add(combo)
        return {name: options[i] for (name, options), i in zip(TRAIT_CATEGORIES, combo)}

    raise RuntimeError(
        f"failed to find an unused trait combination after {MAX_RETRIES} attempts "
        f"(seed={seed}, {len(existing)} already used)"
    )


def validate_traits(traits: Traits) -> bool:
    """True when every category is present and its value is a legal option."""
    if set(traits) != set(TRAIT_KEYS):
        return False
    return all(traits[name] in options for name, options in TRAIT_CATEGORIES)


def to_indices(traits: Traits) -> TraitIndices:
    """The combination as indices, for the uniqueness set and for compact storage."""
    return tuple(options.index(traits[name]) for name, options in TRAIT_CATEGORIES)


def from_indices(idx: TraitIndices) -> Traits:
    return {name: options[i] for (name, options), i in zip(TRAIT_CATEGORIES, idx)}


def describe(traits: Traits) -> str:
    """Traits as one English clause, for the image prompt.

    Plain and absent options are dropped rather than spelled out — the model does not
    need to be told to draw no hat, and every wasted clause costs attention that should
    go to the features that are actually there.
    """
    parts = [
        f"{traits['Age']} {traits['Species']}",
        traits["Hair"],
        traits["Eyes"],
        traits["Facial"],
        traits["Headwear"],
        traits["Attire"],
        traits["Accessory"],
    ]
    kept = [p for p in parts if p not in TRAIT_SKIP]
    if traits["Expression"] not in TRAIT_SKIP:
        kept.append(f"expression is {traits['Expression']}")
    return ", ".join(kept)


def to_metadata(traits: Traits) -> list:
    """ERC-8048 key-value pairs, ready to write onto the token."""
    return [(f"trait[{k.lower()}]", traits[k]) for k in TRAIT_KEYS]


def traits_to_hex(traits: Traits) -> str:
    """Indices as a compact hex string, one byte per category."""
    return "0x" + bytes(to_indices(traits)).hex()


def hex_to_traits(hex_str: str) -> Traits:
    if hex_str.startswith("0x"):
        hex_str = hex_str[2:]
    return from_indices(tuple(bytes.fromhex(hex_str)))
