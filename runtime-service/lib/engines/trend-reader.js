import { skillByIndex } from "../skills.js";

const OPENSEA_ORIGIN = "https://api.opensea.io";
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
const CHAIN_NAMES = new Map([
  ["eip155:1", "ethereum"],
  ["eip155:11155111", "sepolia"],
]);
const TIMEFRAMES = new Map([
  ["1h", "one_hour"],
  ["24h", "one_day"],
  ["7d", "seven_days"],
]);

export class TrendReaderDataUnavailableError extends Error {}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function totalStats(body) {
  const total = body?.total;
  if (!total) return null;
  return {
    volume: finite(total.volume),
    sales: finite(total.sales),
    owners: finite(total.num_owners),
    floorPrice: finite(total.floor_price),
    floorPriceSymbol: total.floor_price_symbol || null,
  };
}

function intervalStats(body, timeframe) {
  const interval = (body?.intervals || []).find((item) => item.interval === timeframe);
  if (!interval) return null;
  return { interval: timeframe, volume: finite(interval.volume), sales: finite(interval.sales) };
}

export function normalizeTrendReaderInput(input) {
  return skillByIndex(4).inputSchema.parse(input);
}

export class OpenSeaTrendReaderSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new TrendReaderDataUnavailableError("trend_reader_data_unavailable");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { allowNotFound = false, params = {} } = {}) {
    const url = new URL(path, OPENSEA_ORIGIN);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (allowNotFound && response.status === 404) return { body: null, sourceUrl: url.toString() };
    if (!response.ok) throw new TrendReaderDataUnavailableError("trend_reader_data_unavailable");
    try {
      return { body: await response.json(), sourceUrl: url.toString() };
    } catch {
      throw new TrendReaderDataUnavailableError("trend_reader_data_unavailable");
    }
  }

  async snapshot(input) {
    const chainName = CHAIN_NAMES.get(input.chain);
    const timeframe = TIMEFRAMES.get(input.timeframe);
    if (!chainName || !timeframe) throw new TypeError("unsupported Trend Reader chain or timeframe");
    const trending = await this.request("/api/v2/collections/trending", {
      params: {
        timeframe,
        chains: chainName,
        category: input.category,
        limit: String(input.maxCollections),
      },
    });
    const collections = (trending.body?.collections || [])
      .filter((collection) => (
        SLUG.test(String(collection.collection || "")) &&
        !collection.is_disabled &&
        !collection.is_nsfw
      ))
      .slice(0, input.maxCollections);
    const reports = await Promise.all(collections.map(async (collection, index) => {
      const slug = collection.collection;
      const stats = await this.request(`/api/v2/collections/${encodeURIComponent(slug)}/stats`, {
        allowNotFound: true,
      });
      return {
        rank: index + 1,
        slug,
        name: collection.name,
        category: collection.category || null,
        safelistStatus: collection.safelist_status || null,
        openseaUrl: collection.opensea_url,
        contracts: (collection.contracts || []).map((contract) => ({
          chain: contract.chain || null,
          address: String(contract.address || "").toLowerCase() || null,
        })),
        selectedInterval: intervalStats(stats.body, timeframe),
        totals: totalStats(stats.body),
        evidence: { provider: "OpenSea", sourceUrls: [trending.sourceUrl, stats.sourceUrl] },
      };
    }));
    return { collections: reports, truncated: Boolean(trending.body?.next), chainName, timeframe };
  }
}

export async function runTrendReader({ input, source, now = () => new Date() }) {
  const normalized = normalizeTrendReaderInput(input);
  const snapshot = await source.snapshot(normalized);
  return {
    skill: "Trend Reader",
    generatedAt: now().toISOString(),
    reportOnly: true,
    chain: normalized.chain,
    timeframe: normalized.timeframe,
    category: normalized.category || null,
    methodology: "OpenSea's bounded trending-collection ranking with collection stats attached as evidence.",
    truncated: snapshot.truncated,
    collections: snapshot.collections,
    limitations: [
      "OpenSea defines and may change the trending ranking; Census does not reconstruct or guarantee its score.",
      "Rank, sales, volume, owners, and floor price are observations, not forecasts or recommendations.",
      "Missing interval statistics remain null and are never inferred from totals or another timeframe.",
      "No listing, offer, swap quote, transaction, or execution payload is requested or produced.",
    ],
  };
}
