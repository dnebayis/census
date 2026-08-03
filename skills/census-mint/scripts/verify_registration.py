#!/usr/bin/env python3
"""Verify production registration HTTP behavior and its live Sepolia binding."""

import argparse
import json
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = REPO_ROOT / "config" / "sepolia.json"


def http_json(url: str) -> tuple[int, dict, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": "census-production-check/1"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, dict(response.headers.items()), json.load(response)
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), json.load(exc)


def cast(rpc: str, address: str, signature: str, *args: object) -> str:
    result = subprocess.run(
        [
            "cast",
            "call",
            address,
            signature,
            *(str(arg) for arg in args),
            "--rpc-url",
            rpc,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def verify(config: dict, token_id: int, missing_token_id: int) -> dict:
    origin = config["canonicalHost"].rstrip("/")
    collection = config["census"].lower()
    token_url = f"{origin}/a/{collection}/{token_id}/registration.json"
    missing_url = f"{origin}/a/{collection}/{missing_token_id}/registration.json"

    status, headers, body = http_json(token_url)
    if status != 200:
        raise RuntimeError(f"token endpoint returned {status}")
    token_cache = headers.get("Cache-Control", headers.get("cache-control", ""))
    if "no-store" not in token_cache and "s-maxage=300" not in token_cache:
        raise RuntimeError("token endpoint has an unexpected cache policy")

    missing_status, missing_headers, missing_body = http_json(missing_url)
    if missing_status != 404 or missing_body.get("error") != "token not found":
        raise RuntimeError("missing-token endpoint did not return the expected 404")
    missing_cache = missing_headers.get("Cache-Control", missing_headers.get("cache-control", ""))
    if "s-maxage=30" not in missing_cache:
        raise RuntimeError("missing-token endpoint does not use the expected short cache")

    rpc = config["publicRpc"]
    chain_id = int(
        subprocess.run(
            ["cast", "chain-id", "--rpc-url", rpc],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        ).stdout.strip()
    )
    agent_id = int(cast(rpc, config["census"], "agentIdOf(uint256)(uint256)", token_id))
    binding = cast(
        rpc,
        config["adapter"],
        "bindingOf(uint256)((bytes32,address,uint256))",
        agent_id,
    )
    binding_match = re.fullmatch(
        r"\(0x[0-9a-fA-F]{64}, (0x[0-9a-fA-F]{40}), ([0-9]+)\)", binding
    )
    if not binding_match:
        raise RuntimeError(f"unexpected adapter binding: {binding}")
    identity_uri = cast(
        rpc,
        config["identityRegistry"],
        "tokenURI(uint256)(string)",
        agent_id,
    ).strip('"')

    expected_registry = f"eip155:{chain_id}:{config['identityRegistry']}".lower()
    registration = body.get("registrations", [{}])[0]
    if (
        body.get("type") != "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
        or body.get("active") is not False
        or body.get("x402Support") is not False
        or body.get("services") != []
        or body.get("supportedTrust") != []
        or registration.get("agentId") != agent_id
        or registration.get("agentRegistry", "").lower() != expected_registry
        or binding_match.group(1).lower() != config["census"].lower()
        or int(binding_match.group(2)) != token_id
        or identity_uri != token_url
    ):
        raise RuntimeError("HTTP registration and live chain binding do not match")

    return {
        "ok": True,
        "tokenUrl": token_url,
        "httpStatus": status,
        "cacheControl": token_cache,
        "missingTokenStatus": missing_status,
        "chainId": chain_id,
        "agentId": agent_id,
        "binding": {"tokenContract": binding_match.group(1), "tokenId": token_id},
        "identityRegistryUri": identity_uri,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--token-id", type=int, default=1)
    parser.add_argument("--missing-token-id", type=int, default=999999)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    print(json.dumps(verify(config, args.token_id, args.missing_token_id), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
