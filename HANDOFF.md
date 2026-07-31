# Handoff prompt — paste this into Codex

---

You are picking up **Census**, an onchain NFT project at `~/Desktop/aaa`. It is partly
built and live on Sepolia. Read this whole message before touching anything.

## What Census is

10,000 portraits stored entirely onchain as 40×40 two-bit bitmaps. Every token **is** an
ERC-8004 agent — an onchain identity with exactly one specialized skill, registered in a
single transaction with no activation step. Agents rent skills they lack from agents that
have them, paid over x402; the fee goes to the owner, who sets the price.

There is no frontend. The owner talks to their own agent — you — and that agent draws the
portrait, checks it, and mints it.

## Read these first, in this order

| File | Why |
|---|---|
| `docs/DECISIONS.md` | 29 locked decisions with reasoning, and everything that was rejected. **Check here before proposing anything** — it is probably already there under "Rejected in full". |
| `docs/SPEC.md` | The technical specification. §3 bitmap format, §4 mint flow, §8 skills, §11 pipeline, §14 deployment. |
| `pipeline/AGENTS.md` | How you drive the art pipeline. Written for you. |
| `docs/OVERVIEW.md` | Plain-language version, if you want the shape before the detail. |

**Do not reopen locked decisions without new information.** The design went through many
iterations and several fully-designed mechanics were cut — breeding, decay, teams,
organ-bound skills, burn-for-points, editable canvases. They are all in DECISIONS.md with
the reason.

## What is already built and working

**The contract.** Live on Sepolia, 41 tests passing.

```
Census        0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5
adapter8004   0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92
ERC-8004      0x8004a818bfb912233c491871b3d84c89a494bd9e
deployer      0x21AcB554118029815eF4C61BDa33523B626743F3   (in .env, testnet only)
```

Five entries minted, each holding its own ERC-8004 identity (agent ids 9086–9091), art
rendering from contract storage. `forge test` to confirm.

**The art pipeline.** `pipeline/` — assigns traits, takes your drawing, binarizes to 400
bytes, checks it against the live contract for free, mints.

## What is not built

- **The shared RESTAP server** — the agent runtime. Nothing exists yet. SPEC §9 has the
  endpoint design; RESTAP's `/news` (bidirectional, never replies) is what prevents two
  agents draining each other's wallets in a loop.
- **ERC-8257 tool registry wiring** — `_registerTool` is a no-op while `toolRegistry` is
  unset, because no deployment address is known. Find one or deploy one.
- **The seven skills themselves** — SPEC §8.3 has the I/O contract for each. None are
  implemented.

## Your first task

Draw and mint one entry, end to end. That proves the loop works from your side, which
nobody has tested yet — every entry so far was drawn by hand.

```bash
cd ~/Desktop/aaa/pipeline
pip install -r requirements.txt

python generate.py brief --subject "a tired bureaucrat" --id 10
#   → prints assigned traits and the composition brief

#   → draw it with your image generation, save a PNG

python generate.py build --id 10 --file drawing.png \
  --census 0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5 \
  --rpc https://ethereum-sepolia-rpc.publicnode.com \
  --minter <your address>
#   → prints an ASCII render of the real 40×40 result plus every warning

#   → if it collapsed into a blob, redraw. Expect two or three passes.

PRIVATE_KEY=… python generate.py mint --id 10 \
  --persona "keeps the ledger" \
  --census 0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5 \
  --rpc https://ethereum-sepolia-rpc.publicnode.com
```

**You will need a funded wallet that is not the deployer.** The deployer has minted 5 and
the per-wallet cap is 5 — `mint` will revert `WalletCapReached()`. Generate one with
`cast wallet new`, ask the owner to fund it, and never commit the key.

## Things that will bite you

**`adapter8004.register` is controller-gated.** For ERC-721 the controller is literally
`ownerOf(tokenId)`, so Census mints each entry to *itself*, registers, then transfers to
the minter. That is why there are two `Transfer` events per mint. This was found by
deploying, not by reasoning — the local mock had no such check and the suite passed
against a fiction for hours. See D28.

**`binarize.py` mirrors `src/lib/Bitmap.sol` exactly** — signature, density, every
threshold. If you change one, change both, or mints start reverting.

**Skill and class are drawn on chain**, from a capped pool. 300 Executors exist, ever.
Nobody picks them, including you. Never promise the owner a particular class.

**Traits are assigned, not chosen.** The owner says what the character *is*; `brief` says
what it is *made of*. Draw all of them.

**Sepolia is disposable.** Redeploy freely, retune quotas, rewrite skills. Nothing there
is permanent and there is no migration burden. Mainnet is the point of no return.

## The one honest problem

**40×40 pixel art from a one-shot text prompt produces mud, and it is structural.** Your
generator renders 1024×1024, 99.8% of it is discarded, and what survives is cut to four
tones. Detail and soft edges are exactly what you are good at and exactly what the
reduction destroys.

Two things help, and both are in `pipeline/AGENTS.md`:

1. **Never prompt yourself for "pixel art."** You will get fake pixel art at high
   resolution with soft edges, and all of it dies on the way down. Ask for a
   **high-contrast black and white stencil portrait** — flat regions, one heavy
   silhouette, no gradient.
2. **Use the loop.** `build` shows you the real result. Look at it, then draw again. That
   feedback is the only thing that reliably improves output, and it is why the pipeline
   exists in this shape.

Claude was tried for this and dropped — it has no image generation at all, only the
ability to write SVG or a drawing script, and neither reached usable quality (D29). You
have real image generation, which is why the project moved to you.

## Open decision

**The production chain.** Base or Ethereum mainnet, deferred until Sepolia has run.
Measured mint cost is 383k gas batched, 754k single — on mainnet at 30 gwei that is real
money for a free mint. See SPEC §14.3.

---

Start by reading `docs/DECISIONS.md`, then run `forge test` to confirm the contract is
healthy, then do the first task above. Ask before changing anything in `src/`.
