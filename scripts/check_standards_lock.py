#!/usr/bin/env python3
"""Report upstream changes to the Draft ERC snapshots used by Census."""

import json
import re
import sys
import urllib.request
from pathlib import Path

LOCK = Path(__file__).resolve().parents[1] / "docs" / "standards-lock.md"
STANDARDS = (8004, 8048, 8217)


def locked_shas() -> dict[int, str]:
    text = LOCK.read_text()
    result = {}
    for erc in STANDARDS:
        match = re.search(rf"\| ERC-{erc} .*?\[`([0-9a-f]{{40}})`\]", text)
        if not match:
            raise RuntimeError(f"missing ERC-{erc} lock in {LOCK}")
        result[erc] = match.group(1)
    return result


def latest_sha(erc: int) -> str:
    url = (
        "https://api.github.com/repos/ethereum/ERCs/commits"
        f"?path=ERCS/erc-{erc}.md&per_page=1"
    )
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "census-lock-check"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)[0]["sha"]


def main() -> int:
    drift = False
    for erc, locked in locked_shas().items():
        latest = latest_sha(erc)
        if latest != locked:
            drift = True
            print(f"ERC-{erc} changed: locked={locked} latest={latest}")
        else:
            print(f"ERC-{erc} unchanged at {locked}")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(main())
