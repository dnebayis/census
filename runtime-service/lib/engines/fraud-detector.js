import { skillByIndex } from "../skills.js";

const OPENSEA_ORIGIN = "https://api.opensea.io";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

export class FraudDetectorDataUnavailableError extends Error {}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeFraudDetectorInput(input) {
  const parsed = skillByIndex(5).inputSchema.parse(input);
  const id = parsed.target.id.toLowerCase();
  if (parsed.target.type === "wallet" && !ADDRESS.test(id)) {
    throw new TypeError("wallet target must be a 20-byte Ethereum address");
  }
  if (parsed.target.type === "collection" && !SLUG.test(id)) {
    throw new TypeError("collection target must be an OpenSea collection slug");
  }
  return { target: { ...parsed.target, id } };
}

export class OpenSeaFraudDetectorSource {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
    if (!apiKey) throw new FraudDetectorDataUnavailableError("fraud_detector_data_unavailable");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { allowNotFound = false } = {}) {
    const url = new URL(path, OPENSEA_ORIGIN);
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (allowNotFound && response.status === 404) return { body: null, sourceUrl: url.toString() };
    if (!response.ok) throw new FraudDetectorDataUnavailableError("fraud_detector_data_unavailable");
    try {
      return { body: await response.json(), sourceUrl: url.toString() };
    } catch {
      throw new FraudDetectorDataUnavailableError("fraud_detector_data_unavailable");
    }
  }

  async snapshot({ target }) {
    if (target.type === "wallet") {
      const profile = await this.request(`/api/v2/accounts/${encodeURIComponent(target.id)}`, { allowNotFound: true });
      return { type: "wallet", id: target.id, profile: profile.body, sourceUrls: [profile.sourceUrl] };
    }
    const [collection, stats] = await Promise.all([
      this.request(`/api/v2/collections/${encodeURIComponent(target.id)}`, { allowNotFound: true }),
      this.request(`/api/v2/collections/${encodeURIComponent(target.id)}/stats`, { allowNotFound: true }),
    ]);
    return {
      type: "collection",
      id: target.id,
      collection: collection.body,
      stats: stats.body,
      sourceUrls: [collection.sourceUrl, stats.sourceUrl],
    };
  }
}

function assessWallet(snapshot) {
  const profile = snapshot.profile;
  if (!profile) {
    return {
      assessment: "insufficient_evidence",
      findings: [{ severity: "informational", code: "NO_OPENSEA_PROFILE", message: "No OpenSea profile was found; this is not evidence of fraud." }],
      facts: null,
    };
  }
  const findings = [];
  if (!profile.is_verified) {
    findings.push({ severity: "informational", code: "PROFILE_NOT_VERIFIED", message: "The OpenSea profile is not verified; non-verification alone is not evidence of fraud." });
  }
  if (profile.is_agent) {
    findings.push({ severity: "informational", code: "SELF_DECLARED_AGENT", message: "The profile declares an agent wallet; OpenSea states this is self-declared, not verification." });
  }
  return {
    assessment: "no_provider_enforcement_flags_observed",
    findings,
    facts: {
      address: String(profile.address || snapshot.id).toLowerCase(),
      username: profile.username || null,
      verified: Boolean(profile.is_verified),
      selfDeclaredAgent: Boolean(profile.is_agent),
      joinedDate: profile.joined_date || null,
      followerCount: finite(profile.follower_count),
      followingCount: finite(profile.following_count),
    },
  };
}

function assessCollection(snapshot) {
  const collection = snapshot.collection;
  if (!collection) {
    return {
      assessment: "insufficient_evidence",
      findings: [{ severity: "informational", code: "COLLECTION_NOT_FOUND", message: "OpenSea did not return the collection; this is not by itself evidence of fraud." }],
      facts: null,
    };
  }
  const findings = [];
  if (collection.is_disabled) {
    findings.push({ severity: "warning", code: "OPENSEA_DISABLED", message: "OpenSea marks this collection disabled; review the marketplace record before interacting." });
  }
  if (collection.is_nsfw) {
    findings.push({ severity: "informational", code: "OPENSEA_NSFW", message: "OpenSea marks this collection NSFW; this is a content label, not a fraud finding." });
  }
  if (collection.safelist_status !== "verified") {
    findings.push({ severity: "informational", code: "COLLECTION_NOT_VERIFIED", message: "The collection is not OpenSea-verified; non-verification alone is not evidence of fraud." });
  }
  const total = snapshot.stats?.total;
  return {
    assessment: collection.is_disabled ? "provider_enforcement_flag_observed" : "no_provider_enforcement_flags_observed",
    findings,
    facts: {
      slug: collection.collection || snapshot.id,
      name: collection.name || null,
      safelistStatus: collection.safelist_status || null,
      disabled: Boolean(collection.is_disabled),
      nsfw: Boolean(collection.is_nsfw),
      category: collection.category || null,
      openseaUrl: collection.opensea_url || null,
      contracts: (collection.contracts || []).map((contract) => ({
        chain: contract.chain || null,
        address: String(contract.address || "").toLowerCase() || null,
      })),
      stats: total ? {
        volume: finite(total.volume),
        sales: finite(total.sales),
        owners: finite(total.num_owners),
        floorPrice: finite(total.floor_price),
        floorPriceSymbol: total.floor_price_symbol || null,
      } : null,
    },
  };
}

export async function runFraudDetector({ input, source, now = () => new Date() }) {
  const normalized = normalizeFraudDetectorInput(input);
  const snapshot = await source.snapshot(normalized);
  const assessment = snapshot.type === "wallet" ? assessWallet(snapshot) : assessCollection(snapshot);
  return {
    skill: "Fraud Detector",
    generatedAt: now().toISOString(),
    reportOnly: true,
    target: normalized.target,
    ...assessment,
    evidence: { provider: "OpenSea", sourceUrls: snapshot.sourceUrls },
    limitations: [
      "This report surfaces a small set of OpenSea profile and collection flags; it does not determine fraud.",
      "Verification, safelist, NSFW, disabled, follower, market, and profile-age fields may be absent or change.",
      "Contracts, ownership, approvals, malicious code, impersonation, wash trading, links, and offchain conduct are not independently audited.",
      "No blocklist action, transaction, recommendation, or accusation is produced.",
    ],
  };
}
