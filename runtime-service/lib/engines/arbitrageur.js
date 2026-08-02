import { skillByIndex } from "../skills.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
const WATCH_TOKEN = /^([a-z0-9][a-z0-9-]{0,199}):([0-9]+)$/;
const MAX_TARGETS = 20;
const OPENSEA_ORIGIN = "https://api.opensea.io";
const CHAIN_NAMES = new Map([
  ["eip155:1", "ethereum"],
  ["eip155:11155111", "sepolia"],
]);

export class MarketDataUnavailableError extends Error {}

function unique(values) {
  return [...new Set((values || []).map((value) => value.toLowerCase()))];
}

export function normalizeArbitrageurInput(input) {
  const parsed = skillByIndex(1).inputSchema.parse(input);
  const collections = unique(parsed.collections);
  const watchlist = unique(parsed.watchlist);
  if (collections.length + watchlist.length === 0) {
    throw new TypeError("at least one collection or watchlist token is required");
  }
  if (collections.length + watchlist.length > MAX_TARGETS) {
    throw new TypeError(`at most ${MAX_TARGETS} combined targets are allowed`);
  }
  if (collections.some((value) => !SLUG.test(value))) {
    throw new TypeError("collections must contain OpenSea collection slugs");
  }
  if (watchlist.some((value) => !WATCH_TOKEN.test(value))) {
    throw new TypeError("watchlist entries must use collectionSlug:tokenId");
  }
  return { ...parsed, collections, watchlist };
}

function quote(order, chainName) {
  if (!order || (order.status && order.status !== "ACTIVE") || order.chain !== chainName) return undefined;
  const price = order.price?.current || order.price;
  const raw = price?.value;
  const decimals = price?.decimals;
  if (!/^\d+$/.test(raw || "") || BigInt(raw) <= 0n || !Number.isInteger(decimals)) return undefined;
  return {
    amountRaw: raw,
    decimals,
    currency: String(price.currency || "native").toLowerCase(),
    symbol: null,
    orderId: order.order_hash || null,
    marketplace: "opensea.io",
    validUntil: order.protocol_data?.parameters?.endTime || null,
  };
}

function bestQuote(orders, chainName, direction) {
  const quotes = (orders || []).map((order) => quote(order, chainName)).filter(Boolean);
  quotes.sort((a, b) => {
    const left = BigInt(a.amountRaw);
    const right = BigInt(b.amountRaw);
    if (left === right) return String(a.orderId).localeCompare(String(b.orderId));
    const ascending = left < right ? -1 : 1;
    return direction === "min" ? ascending : -ascending;
  });
  return quotes[0];
}

function bestCompatiblePair(listingOrders, offerOrders, chainName) {
  const asks = (listingOrders || []).map((order) => quote(order, chainName)).filter(Boolean);
  const bids = (offerOrders || []).map((order) => quote(order, chainName)).filter(Boolean);
  let best;
  for (const ask of asks) {
    for (const bid of bids) {
      if (ask.currency !== bid.currency || ask.decimals !== bid.decimals) continue;
      const spread = spreadBps(ask, bid);
      if (
        !best ||
        spread > best.spread ||
        (spread === best.spread && String(ask.orderId).localeCompare(String(best.ask.orderId)) < 0)
      ) {
        best = { ask, bid, spread };
      }
    }
  }
  return best;
}

export class OpenSeaMarketSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new MarketDataUnavailableError("market_data_unavailable");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { allowNotFound = false, params = {} } = {}) {
    const url = new URL(path, OPENSEA_ORIGIN);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (allowNotFound && response.status === 404) return { body: undefined, sourceUrl: url.toString() };
    if (!response.ok) throw new MarketDataUnavailableError("market_data_unavailable");
    try {
      return { body: await response.json(), sourceUrl: url.toString() };
    } catch {
      throw new MarketDataUnavailableError("market_data_unavailable");
    }
  }

  async collectionSnapshot(slug, chainName) {
    const safeSlug = encodeURIComponent(slug);
    const [listings, offers] = await Promise.all([
      this.request(`/api/v2/listings/collection/${safeSlug}/all`, { params: { limit: "200" } }),
      this.request(`/api/v2/offers/collection/${safeSlug}`, { params: { limit: "200" } }),
    ]);
    const pair = bestCompatiblePair(listings.body?.listings, offers.body?.offers, chainName);
    return {
      kind: "collection",
      id: slug,
      name: slug,
      ask: pair?.ask || bestQuote(listings.body?.listings, chainName, "min"),
      bid: pair?.bid || bestQuote(offers.body?.offers, chainName, "max"),
      sourceUrls: [listings.sourceUrl, offers.sourceUrl],
      marketplaceUrl: `https://opensea.io/collection/${safeSlug}`,
    };
  }

  async tokenSnapshot(target, chainName) {
    const [, slug, tokenId] = WATCH_TOKEN.exec(target);
    const safeSlug = encodeURIComponent(slug);
    const safeTokenId = encodeURIComponent(tokenId);
    const [listing, offer] = await Promise.all([
      this.request(`/api/v2/listings/collection/${safeSlug}/nfts/${safeTokenId}/best`, { allowNotFound: true }),
      this.request(`/api/v2/offers/collection/${safeSlug}/nfts/${safeTokenId}/best`, { allowNotFound: true }),
    ]);
    return {
      kind: "token",
      id: target,
      name: `${slug} #${tokenId}`,
      collection: slug,
      ask: quote(listing.body, chainName),
      bid: quote(offer.body, chainName),
      sourceUrls: [listing.sourceUrl, offer.sourceUrl],
      marketplaceUrl: `https://opensea.io/collection/${safeSlug}`,
    };
  }

  async snapshot({ chain, collections, watchlist }) {
    const chainName = CHAIN_NAMES.get(chain);
    if (!chainName) throw new TypeError(`unsupported Arbitrageur chain ${chain}`);
    const snapshots = [];
    for (const slug of collections) snapshots.push(await this.collectionSnapshot(slug, chainName));
    for (const target of watchlist) snapshots.push(await this.tokenSnapshot(target, chainName));
    return snapshots;
  }
}

function spreadBps(ask, bid) {
  const askRaw = BigInt(ask.amountRaw);
  const bidRaw = BigInt(bid.amountRaw);
  return Number(((bidRaw - askRaw) * 10_000n) / askRaw);
}

export async function runArbitrageur({ input, source, now = () => new Date() }) {
  const normalized = normalizeArbitrageurInput(input);
  const generatedAt = now().toISOString();
  const snapshots = await source.snapshot(normalized);
  const opportunities = [];
  const observations = [];

  for (const snapshot of snapshots) {
    let reason;
    if (!snapshot.ask || !snapshot.bid) reason = "both an active OpenSea listing and offer are required";
    else if (
      snapshot.ask.currency !== snapshot.bid.currency ||
      snapshot.ask.decimals !== snapshot.bid.decimals
    ) reason = "listing and offer currencies do not match";
    else {
      const grossSpreadBps = spreadBps(snapshot.ask, snapshot.bid);
      if (grossSpreadBps < normalized.minSpreadBps) {
        reason = `gross spread ${grossSpreadBps} bps is below the requested threshold`;
      } else {
        opportunities.push({
          kind: snapshot.kind,
          id: snapshot.id,
          name: snapshot.name,
          collection: snapshot.collection || snapshot.id,
          grossSpreadBps,
          grossDifferenceRaw: (BigInt(snapshot.bid.amountRaw) - BigInt(snapshot.ask.amountRaw)).toString(),
          ask: snapshot.ask,
          bid: snapshot.bid,
          evidence: {
            provider: "OpenSea",
            retrievedAt: generatedAt,
            sourceUrls: snapshot.sourceUrls,
            marketplaceUrl: snapshot.marketplaceUrl,
          },
          reasoning: [
            "The best observed OpenSea offer exceeds the best observed listing in the same currency.",
            "The spread is gross and does not subtract gas, fees, royalties, slippage, or failed-order risk.",
          ],
        });
      }
    }
    if (reason) observations.push({ kind: snapshot.kind, id: snapshot.id, qualified: false, reason });
  }

  opportunities.sort((a, b) => b.grossSpreadBps - a.grossSpreadBps || a.id.localeCompare(b.id));
  return {
    skill: "Arbitrageur",
    generatedAt,
    reportOnly: true,
    chain: normalized.chain,
    methodology: "OpenSea active listings and offers compared in raw units of the same currency.",
    limitations: [
      "Reported spreads are gross observations, not guaranteed or net profit.",
      "Gas, fees, royalties, slippage, order validity races, approvals, and execution risk are not simulated.",
      "No transaction is built, signed, submitted, or recommended as safe.",
    ],
    requestedTargets: normalized.collections.length + normalized.watchlist.length,
    opportunities,
    observations,
  };
}
