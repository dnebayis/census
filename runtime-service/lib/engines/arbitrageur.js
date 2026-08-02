import { skillByIndex } from "../skills.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TOKEN = /^(0x[0-9a-fA-F]{40}):([0-9]+)$/;
const MAX_TARGETS = 25;

const RESERVOIR_ORIGINS = new Map([
  ["eip155:1", "https://api.reservoir.tools"],
  ["eip155:11155111", "https://api-sepolia.reservoir.tools"],
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
  if (collections.some((value) => !ADDRESS.test(value))) {
    throw new TypeError("collections must contain contract addresses");
  }
  if (watchlist.some((value) => !TOKEN.test(value))) {
    throw new TypeError("watchlist entries must use contract:tokenId");
  }
  return { ...parsed, collections, watchlist };
}

function quote(order) {
  const raw = order?.price?.amount?.raw;
  const decimals = order?.price?.currency?.decimals;
  const currency = order?.price?.currency?.contract;
  if (!/^\d+$/.test(raw || "") || BigInt(raw) <= 0n || !Number.isInteger(decimals)) return undefined;
  return {
    amountRaw: raw,
    decimals,
    currency: String(currency || "native").toLowerCase(),
    symbol: order.price.currency.symbol || null,
    orderId: order.id || null,
    marketplace: order.source?.domain || order.source?.name || null,
    validUntil: order.validUntil || order.expiration || null,
  };
}

function collectionSnapshot(collection, requestedId, sourceUrl) {
  return {
    kind: "collection",
    id: requestedId,
    name: collection?.name || null,
    ask: quote(collection?.floorAsk),
    bid: quote(collection?.topBid),
    sourceUrl,
  };
}

function tokenSnapshot(entry, requestedId, sourceUrl) {
  const contract = String(entry?.token?.contract || "").toLowerCase();
  const tokenId = String(entry?.token?.tokenId || "");
  return {
    kind: "token",
    id: contract && tokenId ? `${contract}:${tokenId}` : requestedId,
    name: entry?.token?.name || null,
    collection: entry?.token?.collection?.id || contract,
    ask: quote(entry?.market?.floorAsk),
    bid: quote(entry?.market?.topBid),
    sourceUrl,
  };
}

export class ReservoirMarketSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new MarketDataUnavailableError("market_data_unavailable");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(origin, path, params) {
    const url = new URL(path, origin);
    for (const [name, values] of Object.entries(params)) {
      for (const value of Array.isArray(values) ? values : [values]) url.searchParams.append(name, value);
    }
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new MarketDataUnavailableError("market_data_unavailable");
    try {
      return { body: await response.json(), sourceUrl: url.toString() };
    } catch {
      throw new MarketDataUnavailableError("market_data_unavailable");
    }
  }

  async snapshot({ chain, collections, watchlist }) {
    const origin = RESERVOIR_ORIGINS.get(chain);
    if (!origin) throw new TypeError(`unsupported Arbitrageur chain ${chain}`);
    const snapshots = [];
    for (const id of collections) {
      const { body, sourceUrl } = await this.request(origin, "/collections/v7", {
        id,
        limit: "1",
        normalizeRoyalties: "true",
      });
      const collection = (body.collections || []).find(
        (item) => String(item?.id || item?.contract || "").toLowerCase() === id,
      ) || body.collections?.[0];
      snapshots.push(collectionSnapshot(collection, id, sourceUrl));
    }
    if (watchlist.length) {
      const { body, sourceUrl } = await this.request(origin, "/tokens/v7", {
        tokens: watchlist,
        includeTopBid: "true",
        normalizeRoyalties: "true",
        excludeEOA: "true",
        limit: String(watchlist.length),
      });
      const byId = new Map(
        (body.tokens || []).map((entry) => [
          `${String(entry?.token?.contract || "").toLowerCase()}:${entry?.token?.tokenId}`,
          entry,
        ]),
      );
      for (const id of watchlist) snapshots.push(tokenSnapshot(byId.get(id), id, sourceUrl));
    }
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
    if (!snapshot.ask || !snapshot.bid) reason = "both a fillable ask and bid are required";
    else if (
      snapshot.ask.currency !== snapshot.bid.currency ||
      snapshot.ask.decimals !== snapshot.bid.decimals
    ) reason = "ask and bid currencies do not match";
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
          evidence: { provider: "Reservoir", retrievedAt: generatedAt, sourceUrl: snapshot.sourceUrl },
          reasoning: [
            "The best observed bid exceeds the best observed ask in the same currency.",
            "The spread is gross and does not subtract gas, marketplace fees, royalties, slippage, or failed-order risk.",
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
    methodology: "Reservoir best asks and top bids compared in raw units of the same currency.",
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
