# Standards lock

Census locks the mint-core standards and the ERC-8257 runtime discovery surface. The
deployed ABI does not silently follow moving Draft specifications. Upstream changes are
reported by CI and reviewed before any new deployment.

Snapshot date: **2026-07-31**

| Standard | Role | Locked upstream commit |
|---|---|---|
| ERC-8004 | Agent identity and registration file | [`503591a6e80e6e1affdd6403341e25269141f046`](https://github.com/ethereum/ERCs/commit/503591a6e80e6e1affdd6403341e25269141f046) |
| ERC-8048 | Onchain token metadata | [`3173bbe1ad99fdc1f14cc7e54548e83e5e6da3fc`](https://github.com/ethereum/ERCs/commit/3173bbe1ad99fdc1f14cc7e54548e83e5e6da3fc) |
| ERC-8217 | NFT-bound agent control | [`6ca6a3a3a5230c0a5ec30c21c3c3b9eba5ba8e29`](https://github.com/ethereum/ERCs/commit/6ca6a3a3a5230c0a5ec30c21c3c3b9eba5ba8e29) |
| ERC-8257 | Agent tool discovery and manifests | [`1b1b3f854f5c1b8b2b8380211d01db68e94dcf0d`](https://github.com/ethereum/ERCs/commit/1b1b3f854f5c1b8b2b8380211d01db68e94dcf0d) |

ERC-8257 does not change the deployed Census v3 contract. The separate Sepolia registry
and six report-tool registrations use this locked snapshot, real endpoints, canonical
manifests, and JCS hash commitments.

## Upgrade policy

1. The weekly workflow compares each path's newest upstream commit to this table.
2. Drift fails the workflow but never edits interfaces or deployment configuration.
3. A human review determines whether the change affects Census.
4. Any accepted ABI change requires tests, an updated lock, and a new deployment.
