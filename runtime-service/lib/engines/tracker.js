import { skillByIndex } from "../skills.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const OPENSEA_ORIGIN = "https://api.opensea.io";
const CHAIN_NAMES = new Map([
  ["eip155:1", "ethereum"],
  ["eip155:11155111", "sepolia"],
]);

export class TrackerDataUnavailableError extends Error {}

function uniqueAddresses(values) {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

export function normalizeTrackerInput(input, { now = () => new Date() } = {}) {
  const parsed = skillByIndex(2).inputSchema.parse(input);
  const wallets = uniqueAddresses(parsed.wallets);
  if (wallets.some((wallet) => !ADDRESS.test(wallet))) {
    throw new TypeError("wallets must contain 20-byte Ethereum addresses");
  }
  const since = new Date(parsed.since);
  const before = now();
  if (since.getTime() >= before.getTime()) throw new TypeError("since must be earlier than the current time");
  return { ...parsed, wallets, since, before };
}

function address(value) {
  const normalized = String(value || "").toLowerCase();
  return ADDRESS.test(normalized) ? normalized : null;
}

function timestamp(value) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1_000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function transactionHash(event) {
  const value = event.transaction_hash || event.transaction?.hash || event.transaction;
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : null;
}

function normalizePayment(payment) {
  if (!payment) return null;
  const quantity = String(payment.quantity || "");
  const decimals = payment.decimals;
  if (!/^\d+$/.test(quantity) || !Number.isInteger(decimals)) return null;
  return {
    quantityRaw: quantity,
    decimals,
    currency: String(payment.symbol || payment.currency || "unknown").toLowerCase(),
  };
}

function normalizeEvent(event, wallet, sourceUrl) {
  const from = address(event.from_address || event.seller || event.maker);
  const to = address(event.to_address || event.buyer || event.taker);
  let direction = "related";
  if (from === wallet && to === wallet) direction = "self";
  else if (from === wallet) direction = "outgoing";
  else if (to === wallet) direction = "incoming";
  const nft = event.nft || {};
  return {
    wallet,
    type: String(event.event_type || "unknown").toLowerCase(),
    direction,
    occurredAt: timestamp(event.event_timestamp),
    from,
    to,
    nft: {
      chain: nft.chain || event.chain || null,
      contract: address(nft.contract),
      tokenId: nft.identifier === undefined ? null : String(nft.identifier),
      collection: nft.collection || null,
      openseaUrl: nft.opensea_url || null,
    },
    payment: normalizePayment(event.payment),
    evidence: {
      provider: "OpenSea",
      transactionHash: transactionHash(event),
      sourceUrl,
    },
  };
}

export class OpenSeaTrackerSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new TrackerDataUnavailableError("tracker_data_unavailable");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async eventsForWallet({ wallet, chainName, since, before, eventTypes }) {
    const url = new URL(`/api/v2/events/accounts/${encodeURIComponent(wallet)}`, OPENSEA_ORIGIN);
    url.searchParams.set("chain", chainName);
    url.searchParams.set("after", String(Math.floor(since.getTime() / 1_000)));
    url.searchParams.set("before", String(Math.floor(before.getTime() / 1_000)));
    url.searchParams.set("limit", "200");
    for (const eventType of eventTypes) url.searchParams.append("event_type", eventType);
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new TrackerDataUnavailableError("tracker_data_unavailable");
    try {
      const body = await response.json();
      return {
        movements: (body.asset_events || []).map((event) => normalizeEvent(event, wallet, url.toString())),
        truncated: Boolean(body.next),
        sourceUrl: url.toString(),
      };
    } catch (error) {
      if (error instanceof TrackerDataUnavailableError) throw error;
      throw new TrackerDataUnavailableError("tracker_data_unavailable");
    }
  }

  async snapshot({ chain, wallets, since, before, eventTypes }) {
    const chainName = CHAIN_NAMES.get(chain);
    if (!chainName) throw new TypeError(`unsupported Tracker chain ${chain}`);
    return Promise.all(wallets.map(async (wallet) => ({
      wallet,
      ...(await this.eventsForWallet({ wallet, chainName, since, before, eventTypes })),
    })));
  }
}

export async function runTracker({ input, source, now = () => new Date() }) {
  const normalized = normalizeTrackerInput(input, { now });
  const reports = await source.snapshot(normalized);
  const movements = reports
    .flatMap((report) => report.movements)
    .filter((movement) => movement.occurredAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, normalized.maxMovements);
  return {
    skill: "Tracker",
    generatedAt: normalized.before.toISOString(),
    reportOnly: true,
    chain: normalized.chain,
    requestedWallets: normalized.wallets.length,
    eventTypes: normalized.eventTypes,
    movements,
    walletReports: reports.map((report) => ({
      wallet: report.wallet,
      movementCount: report.movements.length,
      truncated: report.truncated,
      sourceUrl: report.sourceUrl,
    })),
    limitations: [
      "OpenSea account events are a bounded snapshot and may be delayed or incomplete.",
      "A pagination cursor marks the wallet report as truncated; this canary never follows cursors automatically.",
      "No ownership conclusion, transaction, alert delivery, or trading recommendation is produced.",
    ],
  };
}
