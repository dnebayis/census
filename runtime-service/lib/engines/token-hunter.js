import { skillByIndex } from "../skills.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const OPENSEA_ORIGIN = "https://api.opensea.io";
const CHAIN_NAMES = new Map([
  ["eip155:1", "ethereum"],
  ["eip155:11155111", "sepolia"],
]);

export class TokenHunterDataUnavailableError extends Error {}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tokenTimestamp(token) {
  const seconds = finite(token.genesis_date) ?? finite(token.created_at);
  if (seconds === null || seconds <= 0) return null;
  return {
    basis: finite(token.genesis_date) !== null ? "genesis_date" : "created_at",
    date: new Date(seconds * 1_000),
  };
}

function normalizeToken(summary, detail, sourceUrls, before) {
  const address = String(summary.address || "").toLowerCase();
  if (!ADDRESS.test(address)) return null;
  const timestamp = tokenTimestamp(detail || summary) || tokenTimestamp(summary);
  const volume24hUsd = finite(detail?.stats?.volume_24h) ?? finite(summary.volume_24h);
  return {
    address,
    chain: summary.chain,
    name: summary.name,
    symbol: summary.symbol,
    openseaUrl: summary.opensea_url,
    usdPrice: finite(detail?.usd_price) ?? finite(summary.usd_price),
    volume24hUsd,
    priceChange24hPct: finite(detail?.stats?.price_change_24h) ?? finite(summary.price_change_24h),
    marketCapUsd: finite(detail?.stats?.market_cap_usd) ?? finite(summary.market_cap_usd),
    holdersCount: finite(detail?.holders_count) ?? finite(summary.holders_count),
    verified: Boolean(detail?.is_verified ?? summary.is_verified),
    status: String(detail?.status || "UNKNOWN").toUpperCase(),
    firstSeenAt: timestamp?.date.toISOString() || null,
    ageBasis: timestamp?.basis || null,
    ageHours: timestamp ? (before.getTime() - timestamp.date.getTime()) / 3_600_000 : null,
    evidence: { provider: "OpenSea", sourceUrls },
  };
}

export function normalizeTokenHunterInput(input, { now = () => new Date() } = {}) {
  const parsed = skillByIndex(3).inputSchema.parse(input);
  return { ...parsed, before: now() };
}

export class OpenSeaTokenHunterSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new TokenHunterDataUnavailableError("token_hunter_data_unavailable");
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
    if (allowNotFound && response.status === 404) return { body: null, sourceUrl: url.toString() };
    if (!response.ok) throw new TokenHunterDataUnavailableError("token_hunter_data_unavailable");
    try {
      return { body: await response.json(), sourceUrl: url.toString() };
    } catch {
      throw new TokenHunterDataUnavailableError("token_hunter_data_unavailable");
    }
  }

  async snapshot(input) {
    const chainName = CHAIN_NAMES.get(input.chain);
    if (!chainName) throw new TypeError(`unsupported Token Hunter chain ${input.chain}`);
    const trending = await this.request("/api/v2/tokens/trending", {
      params: { chains: chainName, limit: "100" },
    });
    const summaries = (trending.body?.tokens || [])
      .filter((token) => token.chain === chainName && ADDRESS.test(String(token.address || "")))
      .map((token) => ({ token, timestamp: tokenTimestamp(token), volume: finite(token.volume_24h) }))
      .filter(({ timestamp, volume }) => (
        timestamp &&
        volume !== null &&
        volume >= input.minVolume24hUsd &&
        (input.before.getTime() - timestamp.date.getTime()) / 3_600_000 <= input.maxAgeHours
      ))
      .sort((a, b) => (finite(b.token.price_change_24h) || 0) - (finite(a.token.price_change_24h) || 0))
      .slice(0, input.maxCandidates);
    return Promise.all(summaries.map(async ({ token }) => {
      const address = String(token.address).toLowerCase();
      const detail = await this.request(`/api/v2/chain/${chainName}/token/${encodeURIComponent(address)}`, {
        allowNotFound: true,
      });
      return normalizeToken(token, detail.body, [trending.sourceUrl, detail.sourceUrl], input.before);
    })).then((tokens) => ({ tokens: tokens.filter(Boolean), truncated: Boolean(trending.body?.next) }));
  }
}

export async function runTokenHunter({ input, source, now = () => new Date() }) {
  const normalized = normalizeTokenHunterInput(input, { now });
  const snapshot = await source.snapshot(normalized);
  const candidates = [];
  const observations = [];
  for (const token of snapshot.tokens) {
    let reason;
    if (token.status !== "OK") reason = `OpenSea safety status is ${token.status}`;
    else if (token.ageHours === null || token.ageHours < 0) reason = "token age evidence is unavailable";
    else if (token.ageHours > normalized.maxAgeHours) reason = "token exceeds the requested maximum age";
    else if (token.volume24hUsd === null || token.volume24hUsd < normalized.minVolume24hUsd) {
      reason = "token is below the requested 24-hour volume";
    } else {
      candidates.push(token);
    }
    if (reason) observations.push({ address: token.address, symbol: token.symbol, qualified: false, reason });
  }
  candidates.sort((a, b) => (
    (b.priceChange24hPct || 0) - (a.priceChange24hPct || 0) ||
    (b.volume24hUsd || 0) - (a.volume24hUsd || 0)
  ));
  return {
    skill: "Token Hunter",
    generatedAt: normalized.before.toISOString(),
    reportOnly: true,
    chain: normalized.chain,
    methodology: "OpenSea trending tokens filtered by earliest known activity, 24-hour USD volume, and safety status.",
    truncated: snapshot.truncated,
    candidates,
    observations,
    limitations: [
      "OpenSea trending rank is a discovery signal, not a recommendation or complete token universe.",
      "Earliest known activity is not a guarantee of contract deployment time, and 24-hour volume is not pool liquidity.",
      "Safety labels may change; contracts, holders, liquidity, taxes, and sellability are not independently verified.",
      "No swap quote, approval, transaction, or execution payload is requested or produced.",
    ],
  };
}
