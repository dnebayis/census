# Decision log

Every locked decision, why it was made, and what was rejected in its place. The design went through many iterations and several mechanics were built out in detail before being cut. This document exists so those questions are not reopened without new information.

---

## The bar a mechanic had to clear

Used to evaluate every proposal. Recorded because it killed most of them.

**A mechanic requires four things:** a resource, a real decision that spends it, my decision changing yours, and compounding over time.

A rendering rule is not a mechanic. "Make gas visual", "derive the art from the holder's address", "make the image also be valid bytecode" — all of these are ways of *displaying* something, not ways of *playing* something. Five early proposals died on this distinction.

**Two additional tests**, applied to every candidate system:

- Remove the agents. Does it die? If not, the agents were decoration.
- Replace the pixels with a number. Does it die? If not, the art was decoration.

Both must fail for the design to be integrated rather than assembled.

---

## Core structure

### D1 — One skill per token, bound to the character

**Decision.** Each token is born with exactly one skill, attached to the character as a whole.

**Why.** An earlier design bound skills to facial regions — eyes for perception, ears for monitoring, mouth for negotiation — with capability transferring between agents by grafting regions. It produced a real problem: faces assembled from eight different creatures' parts stop reading as characters. An anatomical-slot system was designed to fix it, and then the simpler answer appeared: one skill, one character, no grafting, no chimeras, coherent forever.

**Accepted cost.** The collection is no longer a *visual service directory* — you cannot tell a monitoring agent by its large ears. Pixel art becomes identity rather than a capability readout, which weakens one leg of the thesis. Partly recovered by correlating class with skill family (D7): a Skull is an Executor, an Alien is analytical.

**Rejected:** organ ↔ skill binding, anatomical slot systems, skill grafting, chimeric composition.

### D2 — The bitmap is immutable

**Decision.** Written once at mint via SSTORE2, never modified by anyone including us.

**Why.** Every mutation scheme we designed failed one of three filters — an onchain write per rental (cost), grim to play (decay, death, fuel), or breaking the character/skill relationship (skill swapping). Meanwhile the system already has three dynamics that cost nothing: ownership moves through the market, reputation accumulates in the ERC-8004 Reputation Registry, and price is set by the owner. We were adding a fourth dynamic to the token while the game was already in the price.

**Rejected:** editable canvas, programmable canvas, dynamic traits, organ growth on rental.

### D3 — Born as an agent, in one transaction

**Decision.** Mint creates the artwork, the ERC-8004 identity, the metadata, and the tool-registry entry in a single transaction. There is no activation step.

**Why.** A hard requirement. An NFT that becomes an agent later is an NFT with a feature; an NFT that cannot exist without being an agent is a different kind of object. The ERC-8004 Identity Registry is itself an ERC-721, so this is natively possible rather than a workaround.

**Tension this creates.** Single-transaction minting makes the rarity draw grindable (SPEC §4.4). Fixing it properly requires commit-reveal, which would break the single-transaction property. Resolved in favour of keeping the single transaction — grinding is accepted and bounded by the per-wallet cap (D22).

### D4 — Scarcity is a quota per skill type

**Decision.** Fixed caps per skill, summing to exactly 10,000. Class is implied by skill.

**Why.** A hard supply cap alone rewards nothing but speed. Quotas per capability make each skill genuinely scarce and let rental prices reflect real scarcity — 300 Executors versus 3,000 Arbitrageurs produces a price difference nobody has to design.

**Implementation note.** The contract draws from a pool of remaining slots rather than rolling a probability, which guarantees the final distribution is exact rather than approximately correct.

### D5 — No frontend

**Decision.** Minting, renting, and operating all happen through APIs and Claude. Anyone wanting manual control imports the wallet.

**Why.** A deliberate distribution stance, and it is consistent: MCP endpoints per token mean a renter adds an agent directly to their own Claude, which is a better interface than a website would be.

**Constraint it does not remove.** `tokenURI` must still render SVG from the contract, because wallets and marketplaces read it. The rule is *no frontend for minting*, not *no renderer*.

---

## Skills

### D6 — Baseline capability is free; skills sell judgment

**Decision.** Every agent has OpenSea reads, `stream-js` event listening, Seaport writes, a wallet, and x402 payment. Skills are specialized theses on top.

**Why.** The first skill list was OpenSea's API surface chopped into seven pieces — one agent could search, another could place offers. That turns infrastructure into a toll booth and makes skills into plumbing access. Nobody rents an API. When everyone has the same feed, the rentable thing is knowing what to do with it.

**Rejected:** skills as API access; splitting `stream-js` or Seaport across agents.

### D7 — Class correlates with skill family

**Decision.** Human = market work, Agent = watching and verifying, Alien = analysis, Skull = acting without confirmation.

**Why.** Free partial recovery of the legibility lost in D1. Costs no rules — it is only how quotas are allocated.

### D8 — Executor is the only skill with side effects

**Decision.** Six skills report; one acts. Executor is capped at 300, the rarest in the collection.

**Why.** Acting without a confirmation step is the highest-value and highest-risk capability in the system. Its rarity should reflect that, and its class should signal it.

---

## Art and minting

### D9 — Generation is the minter's, not ours

**Decision.** The minter generates the portrait with their own agent. We ship `pipeline/` — trait assignment, the drawing brief, binarization, and the preflight caller — plus `AGENTS.md` telling the agent how to drive it.

**Why.** Generating 10,000 images is a cost we cannot carry. This also removes a mint queue and an image budget entirely.

**Rejected:** a mint-authority signature, where our service generates and signs every bitmap. Clean and enforceable, but it meant paying for every image.

### D10 — The contract checks geometry, not quality

**Decision.** Two hard checks that revert (uniqueness, density band 8–70%). Three soft checks reported by a free `validate()` preflight and never blocking (symmetry, corner clearance, silhouette clarity). No framing mask.

**Why.** Without a mint authority, something must prevent degenerate submissions — but a contract cannot judge whether a portrait is good. It can judge whether it is blank or solid, and whether it already exists. Everything else is advisory, and consistency comes from the pipeline rather than the chain.

The preflight is what makes loose enforcement workable: a free `staticcall` means minters iterate locally and never hit a surprise revert.

**Rejected:** a rigid framing mask (too strict — head and shoulders needs room); near-distance uniqueness rejection (comparing a candidate against up to 10,000 stored signatures onchain is too expensive; exact-match rejection on the 8×8 signature is O(1) and sufficient).

### D11 — 40×40, portrait, front-facing, head and shoulders

**Decision.** Fixed resolution and framing. White background, flat, high contrast, strong silhouette, no gradient, no background elements.

**Why.** The style constraints are not taste. At 40×40 with one or two bits per pixel, a soft or gradient-heavy source image binarizes into mud. These are the constraints under which anything survives the encoding.

### D12 — No gender

**Decision.** Not a trait, not in the persona text, which uses gender-neutral language throughout.

### D13 — Traits live off the bitmap

**Decision.** Traits are ERC-8048 keys, not encoded pixels.

**Why.** They can be extended after launch at negligible cost without touching the artwork.

---

## Stack

### D14 — Build only on standards that have a published specification

**Decision.** ERC-8004 (identity, reputation), ERC-8048 (onchain key-value metadata), ERC-8217 (agent NFT identity bindings), ERC-8257 (agent tool registry), Seaport, x402. Not ERC-8338 or ERC-8239.

**Why.** Every ERC in this project is **Draft** status — that is normal for this generation of standards and is not the useful filter. The filter that matters is whether a readable specification exists:

- Published on `eips.ethereum.org` with a number → the interface is fixed and citable. ERC-8004, 8048, 8217, 8257 all qualify.
- 404, forum thread only → nothing to design against. ERC-8338 and ERC-8239 are here.

Architecture cannot be built against a spec that cannot be read. ERC-8257 covers the same need as the two unpublished drafts, is published, carries an ERC-165 interface ID, and is already queryable through OpenSea MCP's `search_tools`.

**Residual risk, accepted.** A Draft interface can still change. ERC-8048 (`0xdf670be1`) and ERC-8257 (`0xf1dc8075`) both expose ERC-165 interface IDs, so a breaking change is detectable rather than silent — but a migration path should be assumed rather than ruled out.

ERC-8338 and ERC-8239 are tracked, not depended on.

### D15 — Three transports, three roles

**Decision.** RESTAP for agent-to-agent, MCP for human-to-agent, OpenSea MCP as our data source.

**Why RESTAP specifically.** Its `/news` endpoint is bidirectional but never triggers a reply. With 10,000 agents able to hire each other, two agents in a call cycle would drain their owners' funds within minutes. RESTAP solves loop prevention at the protocol level, which is not a detail at this scale.

**Why MCP for humans.** `endpoint[mcp]` per token means a renter adds the agent to their own Claude and uses it as a tool. This is what makes "no frontend" a real position rather than an inconvenience.

### D16 — A single shared RESTAP host, as a default rather than a lock-in

**Decision.** One server serves all agents on day one. Owners who want to run their own runtime can repoint `endpoint[restap]` at it, because that key is owner-writable (D25).

**Why.** Per-owner hosting is more decentralized in principle and would not happen in practice, so a shared host is what makes the collection work at launch. But making the endpoint owner-writable costs nothing and turns the host from a chokepoint into a service — anyone can leave it without leaving the collection, without permission and without a fork.

**Consequence, stated rather than hidden.** The artwork and identity are fully onchain; the agent runtime is not. Documentation says so plainly. This is still the largest architectural compromise in the project, but it is now an opt-out rather than a condition of membership.

### D17 — The cost model must be self-funding

**Decision.** Image generation is paid by the minter's own Claude. Skill-call inference runs on our server but is covered by the renter's x402 payment. Fixed costs are contract deployment and one server.

**Why.** Nothing scales with collection size except call volume, and call volume pays for itself.

---

### D25 — Adopt 721t's key convention, not its contract; split key permissions

**Decision.** Census follows the 721t key convention in full (`context`, `endpoint[*]`, `address[<chain-id>]`) but does not inherit `AgentNFT.sol`. Metadata keys are split into immutable and owner-writable.

**Why the convention.** 721t is nxt3d's reference implementation, not a standard — the standard underneath is ERC-8048. Following its key names means other agents' tooling reads Census entries with no Census-specific code. Free interoperability for zero work.

**Why not the contract.** `AgentNFT.sol` is a plain mintable ERC-721 with owner-writable metadata. It contains none of what Census requires: SSTORE2 bitmap storage, onchain SVG rendering, the validation checks, the skill pool draw, the per-wallet cap, or adapter binding at mint.

**The divergence that mattered.** 721t exposes `setMetadata` so an owner can write any key. Census cannot allow that: `skill` and `class` are the quota assignment, and an owner who could rewrite them would make every cap in D4 meaningless. Both are contract-set at mint with no setter.

**The upside that fell out.** Leaving `endpoint[*]` owner-writable — while locking `skill` and `class` — means owners can repoint their agent at their own server. That converts the shared host from a mandatory chokepoint into an opt-out default (D16), which materially softens the project's biggest compromise for no cost.

---

## Launch parameters

### D20 — 2-bit, four tones

**Decision.** 40×40 at two bits per pixel. 400 bytes, 13 words. Irreversible after launch.

**Why.** Four tones buy shading and edge definition that pure black-and-white cannot carry, and 400 bytes instead of 200 is negligible in gas terms. The style constraints still hold — the extra tones are for deliberate shading, not anti-aliasing or dithering, which read as noise at this resolution.

A soft-check on tone balance (SPEC §4.3) flags art that ignores the mid tones and therefore wastes the depth.

**Rejected:** 1-bit. Cheaper and proven at this resolution, but the saving was not worth the expressive ceiling.

### D21 — Free mint; the minter funds their own gas

**Decision.** No mint price. The minter funds their own wallet, and gas is the only cost of minting.

**Why.** We already carry no generation cost (D9). This extends the same principle to gas: the project has no per-mint expense at all, so there is no economic pressure to charge for entry.

**Consequence that mattered.** Cost was the main argument against deploying to Ethereum mainnet — 10,000 SSTORE2 writes plus identity registrations is expensive. Since each minter pays their own gas, that argument is gone, and the production chain becomes a decision to make against real usage rather than in advance.

### D22 — Per-wallet cap of 5

**Decision.** One address may mint at most five tokens.

**Why.** A free mint opens a gap the paid design did not have: nothing stops one party sweeping the supply. The cap closes it and simultaneously bounds rarity grinding (D3), which a free mint would otherwise make cheaper — two problems, one rule.

It does not stop an actor splitting across wallets. Nothing cheap does. It makes accumulation visible and costly rather than trivial, which is the achievable goal.

**Rejected:** no cap (relies on unique-image friction, which a script defeats); an allowlist (management overhead and a centralized gate on a permissionless design).

### D23 — Sepolia first, with the whole system

**Decision.** The full system deploys to Sepolia — contract, art pipeline, shared RESTAP server, `adapter8004` binding, tool registry entries, and x402 rentals against testnet funds.

**Why.** Sepolia is not a rehearsal for a subset. The unknowns in this design are economic, not technical: whether the skills are genuinely useful, whether anyone rents anything, how owners price against their own quota. Those questions only answer themselves when the whole loop runs. Deploying half of it would test the half that was never in doubt.

The production chain decision (still open) should be made with that data in hand.

### D24 — The project is called **Census**

**Decision.** The collection is **Census**. An individual token is an **entry**.

**Why.** A census is exactly what this is: a record of faces and what each one does. The name describes the object rather than the transaction, which is where eight earlier candidates failed — *Hires, Operators, Retainers, Contacts, Familiars, Savants, Cast, Effigies* were all the same move: an existing English plural naming the mechanic.

It also does not read as an NFT name, which is the point. And it gives the system its vocabulary for free — entries, records, enumeration.

### D27 — Batch minting is the default path

**Decision.** `mintBatch` mints up to the caller's remaining allowance in one transaction. The pipeline uses it by default.

**Why.** Measured at 383k gas per entry versus 754k minting separately — a 50% saving, and the largest single reduction available without reversing a locked decision. Because the wallet cap is five (D22), minting more than one is the normal case, not an edge case.

Nothing about the design changes: each entry still gets its own bitmap, its own skill draw from the pool, and its own ERC-8004 identity. Only the transaction base fee and the warm/cold status of the shared counters are amortised.

**The honest limit.** Total optimisation took the mint from 1,434,340 to 383,352 — 73%. The realistic floor is around 350k, and roughly a third of that sits inside the adapter's ERC-8004 registration, which is external code. **Gas work changes the cost by tens of percent; choosing Base changes it by three orders of magnitude.** These are not alternatives to one another and should not be traded off as if they were.

### D29 — Claude is not a supported drawing route

**Decision.** The pipeline supports agents with real image generation. Claude is not one of them and is not documented as a route.

**Why.** Claude has no image generation model at all — only the ability to write code that draws. Two versions of that were built and tested: SVG rasterised to a PNG, and a script drawing straight onto the 40×40 grid with no downsample. The native route is genuinely lossless and produced the sharpest output of anything tried, but neither reached art anyone would use as a PFP.

**Kept anyway.** `.svg` and `.py` remain accepted inputs. They work, they are provider-neutral, and deleting working code to make a point costs more than leaving it. They are simply not the supported path, and `AGENTS.md` says so.

**What this does not fix.** The quality ceiling is structural, not Claude's: any one-shot text-to-image at 40×40 produces mud, because 99.8% of what the generator renders is discarded. What the pipeline adds is the feedback loop — `build` shows the real result so the agent can see the collapse and redraw. That applies to every provider, and it remains the strongest lever available.

### D28 — Entries are minted to Census, then transferred to the minter

**Decision.** `mint` mints the ERC-721 to the contract itself, registers the ERC-8004 identity, then transfers the entry to the caller.

**Why.** `adapter8004.register` is controller-gated, and for ERC-721 "controller" is literally `ownerOf(tokenId)`. Census calls `register`, so Census must own the entry at that instant. Minting straight to the caller reverts with `NotController`.

This was found by deploying, not by reasoning. The first Sepolia mint reverted `NotController(census, type(uint256).max)` — the local suite had been passing for hours against a mock that did no controller check at all. The mock now enforces it, so this class of bug fails locally from here on.

**Cost.** A second `Transfer` event per mint (zero → Census, Census → minter), visible on explorers.

**Rejected:** having the minter call `register` in a separate transaction. That is exactly the activation step D3 exists to prevent, and D3 is the more important commitment.

**Verified live:** after the transfer, `isController(agentId, owner)` returns true — control follows the token, which is the property the whole design depends on.

### D26 — Sepolia is disposable

**Decision.** Nothing on Sepolia is permanent. Redeploy the contract freely, rewrite skills, retune quotas, regenerate `llms.txt` and the agent instructions at will. No migration burden, no upgrade path to preserve, no state worth rescuing.

**Why it is worth stating.** It changes how to work. Decisions that are irreversible in production — bit depth, the quota table, the immutable key set, validation thresholds — are still cheap to revisit on Sepolia, and should be stress-tested there against real usage rather than defended in advance. The mainnet deployment is the point of no return for all of them.

---

## Optional layers

Neither is required. Both can ship later without migration.

### D18 — Exclusive leasing (optional)

An owner leases their skill exclusively to one renter for a period at a premium. With capped quotas this enables cornering — locking up 50 of 300 Executors moves the price for everyone. One rule, no per-call writes, no artwork changes, and it turns the quota from a passive number into an active target.

**Nearly free to implement.** ERC-8257 already delegates access control to pluggable `IAccessPredicate` contracts (`0xbdf9dc18`), explicitly modelled on Seaport zones and Uniswap v4 hooks. An exclusive lease is a predicate that denies everyone except one renter until expiry, and `getRequirements()` makes the lock machine-readable to the rest of the market. No custom leasing mechanism, no change to the collection contract.

### D19 — Burn as pure supply destruction (optional)

Burning permanently reduces a skill type's supply, raising the value of every remaining one. A buyback-and-burn applied to capability rather than token supply.

**The critical constraint: burning must never be rewarded.** The moment burners receive points or tokens, people burn for the reward rather than for the market reason, and the mechanic becomes farming.

Burned agents stay renderable and are marked dead, so the collection accumulates a visible graveyard and thinned skill types can be seen at a glance. This costs nothing — the bitmap is already written and immutable.

**Known risk.** Burning benefits every holder of that skill type, not only the burner, so free-riding may mean it never happens. Acceptable for an optional layer.

---

## Rejected in full

| Rejected | Reason |
|---|---|
| Breeding / offspring | Not wanted. Added an entire subsystem, and breeding is well-trodden ground |
| Teams / partnerships | The dynamic lived between agents and added nothing to the artwork |
| Skill decay and wear | Grim. Managing death is not fun to play |
| Burning agents as fuel to restore others | Same — coherent, but bleak |
| Organ growth per rental | An onchain write per rental, and it reinvented the ERC-8004 Reputation Registry in pixels at a gas cost |
| Burn for points | Rewarding burns produces farming, not market behaviour |
| Editable / programmable canvas | Once humans edit pixels the agent is unnecessary and the whole thesis collapses |
| Organ ↔ skill binding | Produced incoherent chimeric faces; see D1 |
| Skill swapping between agents | Breaks the character ↔ skill relationship |
| Gender traits | Not wanted |
| Mint-authority signature | We would pay for every image generated |
| Rigid framing mask | Too strict for head-and-shoulders framing; replaced by soft warnings |
| Near-distance uniqueness check | O(n) comparison against 10,000 signatures is too expensive onchain |
| Skills as API access | Infrastructure is not a product; see D6 |
| Rarity with mechanical effects | Would re-inflate the system. Rarity is visual and status only in v1 |

---

## Still open

One only, listed in [SPEC.md §14.3](SPEC.md#143-still-open):

- **Production chain** — deferred until Sepolia has run. Since minters fund their own gas, mainnet is no longer ruled out on cost grounds, so the decision should be made against real usage rather than in advance.
