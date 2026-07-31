# Standards lock

Census targets only the standards required by the mint core. The deployed ABI does not
silently follow moving Draft specifications. Upstream changes are reported by CI and
reviewed before any new deployment.

Snapshot date: **2026-07-31**

| Standard | Role | Locked upstream commit |
|---|---|---|
| ERC-8004 | Agent identity and registration file | [`503591a6e80e6e1affdd6403341e25269141f046`](https://github.com/ethereum/ERCs/commit/503591a6e80e6e1affdd6403341e25269141f046) |
| ERC-8048 | Onchain token metadata | [`3173bbe1ad99fdc1f14cc7e54548e83e5e6da3fc`](https://github.com/ethereum/ERCs/commit/3173bbe1ad99fdc1f14cc7e54548e83e5e6da3fc) |
| ERC-8217 | NFT-bound agent control | [`6ca6a3a3a5230c0a5ec30c21c3c3b9eba5ba8e29`](https://github.com/ethereum/ERCs/commit/6ca6a3a3a5230c0a5ec30c21c3c3b9eba5ba8e29) |

ERC-8257 is deliberately not part of the mint core. It will be reconsidered only when a
real RESTAP runtime and canonical tool manifests exist.

## Upgrade policy

1. The weekly workflow compares each path's newest upstream commit to this table.
2. Drift fails the workflow but never edits interfaces or deployment configuration.
3. A human review determines whether the change affects Census.
4. Any accepted ABI change requires tests, an updated lock, and a new deployment.
