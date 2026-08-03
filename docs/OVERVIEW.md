# Census overview

Census records up to 5,000 user-directed characters as immutable 40×40 one-bit
portraits. Census, not the user-facing flow, assigns nine locked visual traits and one
quota-backed skill. Every mint is registered through the ERC-8004 adapter.

Active Sepolia v6 is `0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab`. Its canonical
registration origin is `https://census-registration-dnebayis.vercel.app`, the adapter is
`0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`, and the Identity Registry is
`0x8004a818bfb912233c491871b3d84c89a494bd9e`.

## System map

1. `brief` stores a secure seed, subject and assigned traits in a draft manifest.
2. An IDE agent creates a normal portrait using only Census art language.
3. The pipeline cover-crops to 40×36, preserves four empty top rows and binarizes to a
   200-byte one-bit bitmap.
4. Drafts at or below 45% density remain byte-for-byte on threshold 128. Denser drafts
   test descending thresholds and choose the smallest change that reaches 32–42% while
   preserving Species and primary facial readability.
5. The user reviews the final 40×40 preview. The exact transaction is simulated from the
   same sender, then one draft uses `mint` and two to five use `mintBatch`.
6. Census stores bitmap plus nine trait bytes in one SSTORE2 record and registers the
   new owner-controlled identity through the adapter.

## Security boundary

V6 rejects paused mints, supply/wallet/batch overflow, invalid UTF-8 context, invalid
traits, reused exact bitmap hashes and reused coarse signatures. The official pipeline
also rejects source/bitmap hash duplicates and near copies within 24 pixels. Reentrancy
guards and checks-effects-interactions protect adapter calls.

There is deliberately no EIP-712 mint authority. Direct callers can select valid trait
indices, and carefully edited bitmaps can evade similarity checks. ERC-2981 announces a
5% royalty but does not restrict transfers. Owner pause affects only new mints.

## Metadata and services

`tokenURI` exposes Class, Skill and all nine Title Case OpenSea string attributes plus
the warm pastel background color. `agentURI` is permanently rooted at the production
registration host and returns registration-v1 JSON with `active: false`, empty services
and trust arrays, and `x402Support: false` as a compatibility field.

Runtime skills are report-only: they can explain, assess and link to sources but cannot
trade, approve, transfer or act financially for a user. X402 payments and Executor
authorization are absent.

The archived v5 address is `0x5863E1d0539c659204B097359AC1a75C51144E78`.
