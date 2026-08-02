import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import toolManifestHandler from "../api/tool-manifest.js";
import toolHandler from "../api/tool.js";
import { MissingBindingError, TokenNotFoundError, readAgent } from "../lib/agent.js";
import { RuntimeBackendConfigurationError, createRuntimeBackends } from "../lib/backends.js";
import { buildCatalog, buildLlmsText, normalizeOrigin } from "../lib/catalog.js";
import {
  MarketDataUnavailableError,
  OpenSeaMarketSource,
  normalizeArbitrageurInput,
  runArbitrageur,
} from "../lib/engines/arbitrageur.js";
import { ViemMintSource, normalizeMintScannerInput, runMintScanner } from "../lib/engines/mint-scanner.js";
import {
  OpenSeaTrackerSource,
  TrackerDataUnavailableError,
  normalizeTrackerInput,
  runTracker,
} from "../lib/engines/tracker.js";
import {
  OpenSeaTokenHunterSource,
  TokenHunterDataUnavailableError,
  normalizeTokenHunterInput,
  runTokenHunter,
} from "../lib/engines/token-hunter.js";
import {
  OpenSeaTrendReaderSource,
  TrendReaderDataUnavailableError,
  normalizeTrendReaderInput,
  runTrendReader,
} from "../lib/engines/trend-reader.js";
import {
  FraudDetectorDataUnavailableError,
  OpenSeaFraudDetectorSource,
  normalizeFraudDetectorInput,
  runFraudDetector,
} from "../lib/engines/fraud-detector.js";
import { RuntimeInactiveError, canExecuteCanary, executeAgentSkill } from "../lib/execution.js";
import { createAgentMcpHandler, createAgentMcpServer } from "../lib/mcp.js";
import { InMemoryNewsStore, RedisNewsStore, newsKey, normalizeNewsItem } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";
import { skillByIndex } from "../lib/skills.js";
import { StandardRedisAdapter, StandardRedisSlidingWindowLimiter } from "../lib/standard-redis.js";
import {
  ERC8257_MANIFEST_TYPE,
  REPORT_TOOLS,
  buildToolManifest,
  buildToolManifestBySlug,
  canonicalManifest,
  manifestHash,
} from "../lib/tool-manifest.js";

const census = "0x1111111111111111111111111111111111111111";
const adapter = "0x2222222222222222222222222222222222222222";
const owner = "0x3333333333333333333333333333333333333333";
const origin = "https://census-runtime.example";
const toolCreator = "0x21acb554118029815ef4c61bda33523b626743f3";

const agent = {
  censusAddress: census,
  tokenId: 2n,
  owner,
  agentId: 9121n,
  className: "Human",
  context: "a dawn cartographer",
  skillIndex: 0,
  skill: skillByIndex(0),
};

const arbitrageurAgent = {
  ...agent,
  tokenId: 3n,
  agentId: 9122n,
  context: "a quiet machinist",
  skillIndex: 1,
  skill: skillByIndex(1),
};

const trackerAgent = {
  ...agent,
  tokenId: 6n,
  agentId: 9125n,
  context: "a patient observer",
  skillIndex: 2,
  skill: skillByIndex(2),
};

const tokenHunterAgent = {
  ...agent,
  tokenId: 4n,
  agentId: 9123n,
  context: "a memory diver",
  skillIndex: 3,
  skill: skillByIndex(3),
};

const trendReaderAgent = {
  ...agent,
  tokenId: 6n,
  agentId: 9125n,
  context: "a signal listener",
  skillIndex: 4,
  skill: skillByIndex(4),
};

const fraudDetectorAgent = {
  ...agent,
  tokenId: 7n,
  agentId: 9126n,
  context: "a cautious examiner",
  skillIndex: 5,
  skill: skillByIndex(5),
};

function fakeClient(overrides = {}) {
  return {
    getBlockNumber: async () => 1n,
    readContract: async ({ functionName }) => {
      if (functionName === "ownerOf") return owner;
      if (functionName === "agentIdOf") return 9121n;
      if (functionName === "skillOf") return 0;
      if (functionName === "classOf") return "Human";
      if (functionName === "metadata") return "0x61206461776e20636172746f67726170686572";
      if (functionName === "bindingOf") {
        return { standard: 0, tokenContract: census, tokenId: 2n };
      }
      throw new Error(`unexpected ${functionName}`);
    },
    ...overrides,
  };
}

test("reads live agent state and verifies the adapter binding", async () => {
  const result = await readAgent({
    client: fakeClient(),
    censusAddress: census,
    adapterAddress: adapter,
    tokenId: 2n,
  });
  assert.equal(result.owner, owner);
  assert.equal(result.agentId, 9121n);
  assert.equal(result.skill.name, "Mint Scanner");
  assert.equal(result.context, "a dawn cartographer");
});

test("distinguishes a missing token from a broken binding", async () => {
  await assert.rejects(
    readAgent({
      client: fakeClient({
        readContract: async ({ functionName }) => {
          if (functionName === "ownerOf") throw new Error("revert");
          throw new Error("unexpected");
        },
      }),
      censusAddress: census,
      adapterAddress: adapter,
      tokenId: 99n,
    }),
    TokenNotFoundError,
  );

  const badBinding = fakeClient({
    readContract: async (call) => {
      if (call.functionName === "bindingOf") {
        return { standard: 0, tokenContract: adapter, tokenId: 2n };
      }
      return fakeClient().readContract(call);
    },
  });
  await assert.rejects(
    readAgent({ client: badBinding, censusAddress: census, adapterAddress: adapter, tokenId: 2n }),
    MissingBindingError,
  );
});

test("builds an inactive address-routed RESTAP catalog", () => {
  const catalog = buildCatalog(agent, origin);
  assert.equal(catalog.active, false);
  assert.equal(catalog.agent.skill, "Mint Scanner");
  assert.equal(
    catalog.agent.base_url,
    `${origin}/a/${census}/2`,
  );
  assert.equal(catalog.capabilities[0].endpoint, "/talk");
  assert.match(catalog.capabilities[0].description, /invocation remains inactive/);
  const canaryCatalog = buildCatalog(arbitrageurAgent, origin, { canaryAvailable: true });
  assert.equal(canaryCatalog.capabilities[0].description, "Report-only Arbitrageur execution is enabled.");
  assert.equal(catalog.capabilities[1].endpoint, "/news");
  assert.equal(catalog.protocols.mcp.transport, "streamable-http");
  assert.deepEqual(Object.keys(catalog.protocols), ["mcp"]);
  assert.throws(() => normalizeOrigin("http://runtime.example"), /https origin/);
  assert.throws(() => normalizeOrigin(`${origin}/path`), /must not include a path/);
});

test("llms.txt describes every skill without claiming activation", () => {
  const text = buildLlmsText(origin);
  assert.match(text, /Mint Scanner/);
  assert.match(text, /Executor/);
  assert.match(text, /not active/);
  assert.match(text, /\/news is passive/);
});

test("builds six deterministic open ERC-8257 report-tool manifests", () => {
  const expectedHashes = {
    "mint-scanner": "0x5e211e00b905a5c36305a917a9d4bd8eb004e74ef2df4d0393b50fdca62dd4fe",
    arbitrageur: "0xc13cb31bc194b97d5a01c0b3c445dcfdc352444ec5740e89f418d4df50ac877c",
    tracker: "0x3b1528672023920745363e8cc74fd497ad34701e97ef79c17b26af94d00007aa",
    "token-hunter": "0x508a5390bd6793cfd8e913eb62f200b80d85adebafcd3798911c7b8a1de7773c",
    "trend-reader": "0x3b67aba189d11b3305648e8553cea5700adf68afd7ce1ab78900c47ff9a62213",
    "fraud-detector": "0x2ffb344b5d9345512acfdbe72e506dd780526b64f8f5647b6b5c74a9b049575e",
  };
  assert.equal(REPORT_TOOLS.length, 6);
  for (const skill of REPORT_TOOLS) {
    const manifest = buildToolManifest(skill, origin, toolCreator);
    assert.equal(manifest.type, ERC8257_MANIFEST_TYPE);
    assert.equal(manifest.endpoint, `${origin}/tools/${skill.slug}`);
    assert.equal(manifest.creatorAddress, toolCreator);
    assert.deepEqual(manifest.inputs.required, ["censusAddress", "tokenId", "input"]);
    assert.equal("pricing" in manifest, false);
    assert.equal("access" in manifest, false);
    assert.ok(Buffer.byteLength(canonicalManifest(manifest)) < 1_048_576);
    assert.equal(manifestHash(manifest), expectedHashes[skill.slug]);
  }
});

test("ERC-8257 manifests reject unknown tools and unsafe creator addresses", () => {
  assert.throws(
    () => buildToolManifestBySlug("executor", {
      RUNTIME_ORIGIN: origin,
      ERC8257_CREATOR_ADDRESS: toolCreator,
    }),
    /tool not found/,
  );
  assert.throws(
    () => buildToolManifest(REPORT_TOOLS[0], origin, toolCreator.toUpperCase()),
    /lowercase nonzero EVM address/,
  );
  assert.throws(
    () => buildToolManifest(REPORT_TOOLS[0], origin, "0x0000000000000000000000000000000000000000"),
    /must not be zero/,
  );
});

test("well-known ERC-8257 handler serves manifests and rejects invalid slugs", () => {
  function invoke(slug) {
    let status;
    let body;
    const headers = new Map();
    toolManifestHandler(
      { method: "GET", query: { slug } },
      {
        setHeader(name, value) { headers.set(name, value); },
        status(value) { status = value; return this; },
        json(value) { body = value; return value; },
      },
    );
    return { status, body, headers };
  }

  const previousOrigin = process.env.RUNTIME_ORIGIN;
  const previousCreator = process.env.ERC8257_CREATOR_ADDRESS;
  process.env.RUNTIME_ORIGIN = origin;
  process.env.ERC8257_CREATOR_ADDRESS = toolCreator;
  try {
    const found = invoke("mint-scanner");
    assert.equal(found.status, 200);
    assert.equal(found.body.endpoint, `${origin}/tools/mint-scanner`);
    assert.match(found.headers.get("Cache-Control"), /no-store/);
    assert.deepEqual(invoke("executor").body, { error: "tool not found" });
    assert.equal(invoke("executor").status, 404);
  } finally {
    if (previousOrigin === undefined) delete process.env.RUNTIME_ORIGIN;
    else process.env.RUNTIME_ORIGIN = previousOrigin;
    if (previousCreator === undefined) delete process.env.ERC8257_CREATOR_ADDRESS;
    else process.env.ERC8257_CREATOR_ADDRESS = previousCreator;
  }
});

test("ERC-8257 tool endpoint rejects invalid methods, bodies, and slugs before chain reads", async () => {
  async function invoke({ method = "POST", slug = "mint-scanner", body = {} } = {}) {
    let status;
    let output;
    const headers = new Map();
    await toolHandler(
      { method, query: { slug }, body, headers: {} },
      {
        setHeader(name, value) { headers.set(name, value); },
        status(value) { status = value; return this; },
        json(value) { output = value; return value; },
      },
    );
    return { status, output, headers };
  }

  assert.equal((await invoke({ method: "GET" })).status, 405);
  assert.deepEqual(
    (await invoke({ slug: "executor", body: { censusAddress: census, tokenId: "2", input: {} } })).output,
    { error: "tool not found" },
  );
  assert.equal(
    (await invoke({ body: { censusAddress: census, tokenId: "2", input: {}, extra: true } })).status,
    400,
  );
});

test("news storage is passive and bounded", async () => {
  const store = new InMemoryNewsStore();
  const key = newsKey(agent);
  const item = normalizeNewsItem({ message: "done", source: "agent-7" }, () => new Date(0));
  await store.append(key, item);
  const items = await store.list(key);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].payload, { message: "done", source: "agent-7" });
  assert.equal(items[0].received_at, "1970-01-01T00:00:00.000Z");
  assert.equal("reply" in items[0], false);
  assert.throws(() => normalizeNewsItem("reply to me"), /JSON object/);
});

test("Redis news storage persists JSON and trims the queue", async () => {
  const lists = new Map();
  const redis = {
    multi() {
      const operations = [];
      return {
        rpush(key, value) {
          operations.push(() => lists.set(key, [...(lists.get(key) || []), value]));
          return this;
        },
        ltrim(key, start) {
          operations.push(() => lists.set(key, (lists.get(key) || []).slice(start)));
          return this;
        },
        async exec() {
          operations.forEach((operation) => operation());
        },
      };
    },
    async lrange(key) {
      return lists.get(key) || [];
    },
  };
  const store = new RedisNewsStore(redis, { maxItems: 2 });
  await store.append("agent", { id: "1" });
  await store.append("agent", { id: "2" });
  await store.append("agent", { id: "3" });
  assert.deepEqual(await store.list("agent"), [{ id: "2" }, { id: "3" }]);
});

test("runtime backends require secret-managed Redis credentials", () => {
  assert.throws(() => createRuntimeBackends({}), RuntimeBackendConfigurationError);
  assert.doesNotThrow(() =>
    createRuntimeBackends({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-only-token",
    }),
  );
  assert.doesNotThrow(() => createRuntimeBackends({ REDIS_URL: "rediss://default:test@example.com:6379" }));
});

test("standard Redis adapter normalizes queue commands and sliding-window results", async () => {
  const commands = [];
  const fakeClient = {
    isOpen: false,
    on() {},
    async connect() {
      this.isOpen = true;
    },
    multi() {
      return {
        rPush(key, value) {
          commands.push(["rPush", key, value]);
          return this;
        },
        lTrim(key, start, stop) {
          commands.push(["lTrim", key, start, stop]);
          return this;
        },
        async exec() {
          return [1, "OK"];
        },
      };
    },
    async lRange() {
      return ['{"id":"one"}'];
    },
    async eval() {
      return [1, 3, 61_000];
    },
    async close() {
      this.isOpen = false;
    },
  };
  const redis = new StandardRedisAdapter("rediss://unused", fakeClient);
  const store = new RedisNewsStore(redis, { prefix: "test", maxItems: 2 });
  await store.append("agent", { id: "one" });
  assert.deepEqual(commands, [
    ["rPush", "test:agent", '{"id":"one"}'],
    ["lTrim", "test:agent", -2, -1],
  ]);
  assert.deepEqual(await store.list("agent"), [{ id: "one" }]);

  const limiter = new StandardRedisSlidingWindowLimiter(redis, {
    limit: 5,
    windowMs: 60_000,
    prefix: "limit",
  });
  assert.deepEqual(await limiter.limit("agent", 1_000), {
    success: true,
    limit: 5,
    remaining: 2,
    reset: 61_000,
  });
  await redis.close();
});

test("rate limiting hashes the client address and emits retry metadata", async () => {
  const request = { headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" } };
  assert.equal(clientKey(request).length, 24);
  assert.doesNotMatch(clientKey(request), /203\.0\.113\.8/);

  const headers = new Map();
  let body;
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
    },
    status(code) {
      assert.equal(code, 429);
      return this;
    },
    json(value) {
      body = value;
    },
  };
  const allowed = await applyRateLimit(
    response,
    { limit: async () => ({ success: false, limit: 20, remaining: 0, reset: Date.now() + 5_000 }) },
    "agent:client",
  );
  assert.equal(allowed, false);
  assert.equal(headers.get("X-RateLimit-Limit"), "20");
  assert.equal(headers.get("Retry-After"), "5");
  assert.deepEqual(body, { error: "rate limit exceeded" });
});

test("Mint Scanner groups standard mint events into evidence-backed candidates", async () => {
  const now = () => new Date("2026-07-31T12:00:00.000Z");
  const report = await runMintScanner({
    now,
    input: {
      chains: ["eip155:11155111"],
      timeWindowHours: 2,
      filters: { minMints: 2, maxCandidates: 5, maxEvidencePerCandidate: 2 },
    },
    sources: {
      "eip155:11155111": {
        async scanMints({ requestedSince }) {
          return {
            chain: "eip155:11155111",
            requestedSince: requestedSince.toISOString(),
            fromBlock: 100n,
            toBlock: 200n,
            truncated: false,
            events: [
              { collection: census, transactionHash: "0xaaa", blockNumber: 120n, tokenId: 1n, recipient: owner },
              { collection: census, transactionHash: "0xbbb", blockNumber: 121n, tokenId: 2n, recipient: adapter },
              { collection: adapter, transactionHash: "0xccc", blockNumber: 122n, tokenId: 1n, recipient: owner },
            ],
          };
        },
      },
    },
  });
  assert.equal(report.reportOnly, true);
  assert.equal(report.chains[0].candidates.length, 1);
  assert.equal(report.chains[0].candidates[0].collection, census);
  assert.equal(report.chains[0].candidates[0].mintCount, 2);
  assert.equal(report.chains[0].candidates[0].evidence.length, 2);
  assert.match(report.chains[0].candidates[0].reasoning[2], /not a safety/);
});

test("Mint Scanner rejects unsupported filters and chains", async () => {
  assert.throws(
    () => normalizeMintScannerInput({ chains: ["eip155:11155111"], timeWindowHours: 1, filters: { maxCandidates: 0 } }),
    /maxCandidates/,
  );
  await assert.rejects(
    runMintScanner({ input: { chains: ["eip155:1"], timeWindowHours: 1 }, sources: {} }),
    /unsupported Mint Scanner chain/,
  );
});

test("Arbitrageur reports only same-currency gross bid-ask crossovers", async () => {
  const report = await runArbitrageur({
    now: () => new Date("2026-08-03T00:00:00.000Z"),
    input: {
      chain: "eip155:1",
      collections: ["census-fixture", "CENSUS-FIXTURE"],
      watchlist: ["quiet-machinist:7"],
      minSpreadBps: 1_000,
    },
    source: {
      async snapshot(input) {
        assert.deepEqual(input.collections, ["census-fixture"]);
        return [
          {
            kind: "collection",
            id: "census-fixture",
            name: "Census fixture",
            ask: { amountRaw: "100", decimals: 18, currency: "native", orderId: "ask-1" },
            bid: { amountRaw: "125", decimals: 18, currency: "native", orderId: "bid-1" },
            sourceUrls: ["https://api.opensea.io/api/v2/listings/collection/census-fixture/all"],
          },
          { kind: "token", id: "quiet-machinist:7", ask: undefined, bid: undefined },
        ];
      },
    },
  });
  assert.equal(report.skill, "Arbitrageur");
  assert.equal(report.reportOnly, true);
  assert.equal(report.requestedTargets, 2);
  assert.equal(report.opportunities.length, 1);
  assert.equal(report.opportunities[0].grossSpreadBps, 2_500);
  assert.equal(report.opportunities[0].grossDifferenceRaw, "25");
  assert.equal(report.observations.length, 1);
  assert.match(report.limitations[0], /not guaranteed/);
});

test("Arbitrageur compares mainnet ETH and canonical WETH at 1:1 without hiding conversion cost", async () => {
  const report = await runArbitrageur({
    input: { chain: "eip155:1", collections: ["wrapped-fixture"], minSpreadBps: 100 },
    source: {
      async snapshot() {
        return [{
          kind: "collection",
          id: "wrapped-fixture",
          ask: { amountRaw: "100", decimals: 18, currency: "ETH" },
          bid: { amountRaw: "110", decimals: 18, currency: "WETH" },
        }];
      },
    },
  });
  assert.equal(report.opportunities[0].grossSpreadBps, 1_000);
  assert.deepEqual(report.opportunities[0].currencyConversion, {
    required: true,
    pair: "ETH/WETH",
    rate: "1:1",
    costsIncluded: false,
  });
  assert.match(report.limitations[1], /wrapping/);
});

test("Arbitrageur validates bounded collection and token targets", () => {
  assert.throws(
    () => normalizeArbitrageurInput({ minSpreadBps: 1 }),
    /at least one collection/,
  );
  assert.throws(
    () => normalizeArbitrageurInput({ collections: ["Not a slug!"], minSpreadBps: 1 }),
    /collection slugs/,
  );
  assert.throws(
    () => normalizeArbitrageurInput({ watchlist: [census], minSpreadBps: 1 }),
    /collectionSlug:tokenId/,
  );
});

test("OpenSea adapter sends the API key and maps collection and token quotes", async () => {
  const requests = [];
  const order = (value, { listing = false, currency = census } = {}) => ({
    order_hash: `order-${value}`,
    chain: "ethereum",
    status: "ACTIVE",
    price: listing
      ? { current: { value, decimals: 18, currency } }
      : { value, decimals: 18, currency },
    protocol_data: { parameters: { endTime: "9999999999" } },
  });
  const source = new OpenSeaMarketSource({
    apiKey: "test-key",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      const isToken = url.pathname.includes("/nfts/");
      const isListing = url.pathname.includes("/listings/");
      const body = isToken
        ? order(isListing ? "200" : "220", { listing: isListing, currency: isListing ? "ETH" : "WETH" })
        : isListing
          ? {
              listings: [
                { ...order("90", { listing: true }), price: { current: { value: "90", decimals: 18, currency: owner } } },
                order("100", { listing: true, currency: "ETH" }),
              ],
            }
          : {
              offers: [
                { ...order("999"), price: { value: "999", decimals: 18, currency: adapter } },
                order("110", { currency: "WETH" }),
              ],
            };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const snapshots = await source.snapshot({
    chain: "eip155:1",
    collections: ["census-fixture"],
    watchlist: ["quiet-machinist:7"],
  });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].ask.amountRaw, "100");
  assert.equal(snapshots[1].bid.amountRaw, "220");
  assert.equal(requests[0].url.origin, "https://api.opensea.io");
  assert.equal(requests[0].options.headers["x-api-key"], "test-key");
  assert.equal(requests.length, 4);
  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/quiet-machinist/nfts/7/best")));
  assert.ok(requests.every(({ url }) => url.origin === "https://api.opensea.io"));
});

test("OpenSea adapter fails closed when market data is unavailable", async () => {
  assert.throws(() => new OpenSeaMarketSource(), MarketDataUnavailableError);
  const source = new OpenSeaMarketSource({
    apiKey: "test-key",
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });
  await assert.rejects(
    source.snapshot({ chain: "eip155:1", collections: ["census-fixture"], watchlist: [] }),
    MarketDataUnavailableError,
  );
});

test("Tracker validates and deduplicates bounded wallet input", () => {
  const normalized = normalizeTrackerInput(
    { wallets: [owner, owner.toUpperCase()], since: "2026-08-02T00:00:00.000Z" },
    { now: () => new Date("2026-08-03T00:00:00.000Z") },
  );
  assert.deepEqual(normalized.wallets, [owner]);
  assert.deepEqual(normalized.eventTypes, ["transfer", "sale", "mint"]);
  assert.equal(normalized.maxMovements, 50);
  assert.throws(
    () => normalizeTrackerInput({ wallets: ["not-a-wallet"], since: "2026-08-02T00:00:00.000Z" }),
    /Ethereum addresses/,
  );
  assert.throws(
    () => normalizeTrackerInput(
      { wallets: [owner], since: "2026-08-04T00:00:00.000Z" },
      { now: () => new Date("2026-08-03T00:00:00.000Z") },
    ),
    /earlier/,
  );
});

test("OpenSea Tracker maps account movements with bounded evidence", async () => {
  const requests = [];
  const source = new OpenSeaTrackerSource({
    apiKey: "test-key",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        asset_events: [{
          event_type: "transfer",
          event_timestamp: 1785634200,
          transaction: { hash: `0x${"a".repeat(64)}` },
          from_address: adapter,
          to_address: owner,
          nft: {
            chain: "ethereum",
            contract: census,
            identifier: "7",
            collection: "census-fixture",
            opensea_url: "https://opensea.io/item/ethereum/census/7",
          },
        }],
        next: "bounded-cursor",
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const report = await runTracker({
    input: {
      chain: "eip155:1",
      wallets: [owner],
      since: "2026-08-02T00:00:00.000Z",
      eventTypes: ["transfer"],
      maxMovements: 10,
    },
    source,
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  assert.equal(report.reportOnly, true);
  assert.equal(report.movements[0].direction, "incoming");
  assert.equal(report.movements[0].evidence.transactionHash, `0x${"a".repeat(64)}`);
  assert.equal(report.walletReports[0].truncated, true);
  assert.equal(requests[0].url.origin, "https://api.opensea.io");
  assert.equal(requests[0].url.searchParams.get("chain"), "ethereum");
  assert.deepEqual(requests[0].url.searchParams.getAll("event_type"), ["transfer"]);
  assert.equal(requests[0].options.headers["x-api-key"], "test-key");
});

test("OpenSea Tracker fails closed without usable provider data", async () => {
  assert.throws(() => new OpenSeaTrackerSource(), TrackerDataUnavailableError);
  const source = new OpenSeaTrackerSource({
    apiKey: "test-key",
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });
  await assert.rejects(
    source.snapshot({
      chain: "eip155:1",
      wallets: [owner],
      since: new Date("2026-08-02T00:00:00.000Z"),
      before: new Date("2026-08-03T00:00:00.000Z"),
      eventTypes: ["transfer"],
    }),
    TrackerDataUnavailableError,
  );
});

test("Token Hunter normalizes honest volume and age filters", () => {
  const normalized = normalizeTokenHunterInput(
    { minVolume24hUsd: 50_000, maxAgeHours: 72 },
    { now: () => new Date("2026-08-03T00:00:00.000Z") },
  );
  assert.equal(normalized.chain, "eip155:1");
  assert.equal(normalized.maxCandidates, 10);
  assert.equal(normalized.before.toISOString(), "2026-08-03T00:00:00.000Z");
  assert.throws(
    () => normalizeTokenHunterInput({ minLiquidityUsd: 1, maxAgeHours: 24 }),
    /minVolume24hUsd/,
  );
});

test("OpenSea Token Hunter returns only young OK-status volume candidates", async () => {
  const requests = [];
  const firstSeen = Date.parse("2026-08-02T12:00:00.000Z") / 1_000;
  const young = "0x4444444444444444444444444444444444444444";
  const warning = "0x5555555555555555555555555555555555555555";
  const source = new OpenSeaTokenHunterSource({
    apiKey: "test-key",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      if (url.pathname.endsWith("/tokens/trending")) {
        return new Response(JSON.stringify({
          tokens: [
            { address: young, chain: "ethereum", name: "Young", symbol: "YNG", decimals: 18, usd_price: "0.1", opensea_url: "https://opensea.io/token/young", volume_24h: 150_000, price_change_24h: 25, genesis_date: firstSeen, is_verified: false },
            { address: warning, chain: "ethereum", name: "Warning", symbol: "WARN", decimals: 18, usd_price: "0.2", opensea_url: "https://opensea.io/token/warning", volume_24h: 100_000, price_change_24h: 10, created_at: firstSeen, is_verified: false },
          ],
          next: "next-page",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const status = url.pathname.endsWith(young) ? "OK" : "WARNING";
      return new Response(JSON.stringify({ status, stats: { volume_24h: status === "OK" ? 150_000 : 100_000 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const report = await runTokenHunter({
    input: { chain: "eip155:1", minVolume24hUsd: 50_000, maxAgeHours: 72, maxCandidates: 5 },
    source,
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  assert.equal(report.reportOnly, true);
  assert.equal(report.truncated, true);
  assert.deepEqual(report.candidates.map(({ symbol }) => symbol), ["YNG"]);
  assert.equal(report.candidates[0].ageBasis, "genesis_date");
  assert.equal(report.observations[0].reason, "OpenSea safety status is WARNING");
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url.searchParams.get("chains"), "ethereum");
  assert.equal(requests[0].options.headers["x-api-key"], "test-key");
});

test("OpenSea Token Hunter fails closed when discovery is unavailable", async () => {
  assert.throws(() => new OpenSeaTokenHunterSource(), TokenHunterDataUnavailableError);
  const source = new OpenSeaTokenHunterSource({
    apiKey: "test-key",
    fetchImpl: async () => new Response("unavailable", { status: 429 }),
  });
  await assert.rejects(
    source.snapshot({
      chain: "eip155:1",
      minVolume24hUsd: 0,
      maxAgeHours: 24,
      maxCandidates: 10,
      before: new Date("2026-08-03T00:00:00.000Z"),
    }),
    TokenHunterDataUnavailableError,
  );
});

test("Trend Reader normalizes bounded timeframe and category input", () => {
  const normalized = normalizeTrendReaderInput({ timeframe: "24h", category: "art" });
  assert.equal(normalized.chain, "eip155:1");
  assert.equal(normalized.maxCollections, 10);
  assert.throws(() => normalizeTrendReaderInput({ timeframe: "30d" }), /timeframe/);
  assert.throws(() => normalizeTrendReaderInput({ timeframe: "1h", category: "anything" }), /category/);
});

test("OpenSea Trend Reader attaches exact interval and total collection evidence", async () => {
  const requests = [];
  const source = new OpenSeaTrendReaderSource({
    apiKey: "test-key",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      if (url.pathname.endsWith("/collections/trending")) {
        return new Response(JSON.stringify({
          collections: [{
            collection: "signal-fixture",
            name: "Signal Fixture",
            category: "art",
            safelist_status: "verified",
            is_disabled: false,
            is_nsfw: false,
            opensea_url: "https://opensea.io/collection/signal-fixture",
            contracts: [{ chain: "ethereum", address: census }],
          }],
          next: "next-page",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        total: { volume: 1_000, sales: 100, num_owners: 50, floor_price: 1.25, floor_price_symbol: "ETH" },
        intervals: [
          { interval: "one_day", volume: 250, sales: 20 },
          { interval: "seven_days", volume: 800, sales: 70 },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const report = await runTrendReader({
    input: { chain: "eip155:1", timeframe: "24h", category: "art", maxCollections: 5 },
    source,
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  assert.equal(report.reportOnly, true);
  assert.equal(report.truncated, true);
  assert.equal(report.collections[0].rank, 1);
  assert.deepEqual(report.collections[0].selectedInterval, { interval: "one_day", volume: 250, sales: 20 });
  assert.equal(report.collections[0].totals.floorPrice, 1.25);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get("timeframe"), "one_day");
  assert.equal(requests[0].url.searchParams.get("chains"), "ethereum");
  assert.equal(requests[0].url.searchParams.get("category"), "art");
  assert.equal(requests[0].options.headers["x-api-key"], "test-key");
});

test("OpenSea Trend Reader fails closed when ranking is unavailable", async () => {
  assert.throws(() => new OpenSeaTrendReaderSource(), TrendReaderDataUnavailableError);
  const source = new OpenSeaTrendReaderSource({
    apiKey: "test-key",
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });
  await assert.rejects(
    source.snapshot({ chain: "eip155:1", timeframe: "24h", maxCollections: 5 }),
    TrendReaderDataUnavailableError,
  );
});

test("Fraud Detector validates exact collection slugs and wallet addresses", () => {
  assert.deepEqual(normalizeFraudDetectorInput({ target: { type: "collection", id: "Signal-Fixture" } }), {
    target: { type: "collection", id: "signal-fixture" },
  });
  assert.throws(
    () => normalizeFraudDetectorInput({ target: { type: "wallet", id: "not-a-wallet" } }),
    /Ethereum address/,
  );
  assert.throws(
    () => normalizeFraudDetectorInput({ target: { type: "collection", id: "bad slug!" } }),
    /collection slug/,
  );
});

test("OpenSea Fraud Detector reports provider flags without declaring fraud", async () => {
  const requests = [];
  const source = new OpenSeaFraudDetectorSource({
    apiKey: "test-key",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      const body = url.pathname.endsWith("/stats")
        ? { total: { volume: 100, sales: 5, num_owners: 4, floor_price: 0.1, floor_price_symbol: "ETH" } }
        : {
            collection: "signal-fixture",
            name: "Signal Fixture",
            safelist_status: "not_requested",
            is_disabled: true,
            is_nsfw: false,
            category: "art",
            opensea_url: "https://opensea.io/collection/signal-fixture",
            contracts: [{ chain: "ethereum", address: census }],
          };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const report = await runFraudDetector({
    input: { target: { type: "collection", id: "signal-fixture" } },
    source,
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  assert.equal(report.reportOnly, true);
  assert.equal(report.assessment, "provider_enforcement_flag_observed");
  assert.deepEqual(report.findings.map(({ code }) => code), ["OPENSEA_DISABLED", "COLLECTION_NOT_VERIFIED"]);
  assert.doesNotMatch(JSON.stringify(report), /is fraudulent/i);
  assert.equal(report.facts.stats.owners, 4);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.origin === "https://api.opensea.io"));
  assert.ok(requests.every(({ options }) => options.headers["x-api-key"] === "test-key"));
});

test("Fraud Detector treats wallet non-verification as informational", async () => {
  const report = await runFraudDetector({
    input: { target: { type: "wallet", id: owner } },
    source: {
      async snapshot() {
        return {
          type: "wallet",
          id: owner,
          profile: { address: owner, is_verified: false, is_agent: true, joined_date: "2026-01-01", follower_count: 3, following_count: 4 },
          sourceUrls: [`https://api.opensea.io/api/v2/accounts/${owner}`],
        };
      },
    },
  });
  assert.equal(report.assessment, "no_provider_enforcement_flags_observed");
  assert.ok(report.findings.every(({ severity }) => severity === "informational"));
  assert.equal(report.facts.selfDeclaredAgent, true);
});

test("OpenSea Fraud Detector fails closed on provider errors", async () => {
  assert.throws(() => new OpenSeaFraudDetectorSource(), FraudDetectorDataUnavailableError);
  const source = new OpenSeaFraudDetectorSource({
    apiKey: "test-key",
    fetchImpl: async () => new Response("unavailable", { status: 429 }),
  });
  await assert.rejects(
    source.snapshot({ target: { type: "wallet", id: owner } }),
    FraudDetectorDataUnavailableError,
  );
});

test("Mint Scanner accepts every bound agent from the active Census contract", async () => {
  const enabledEnv = {
    REPORT_MINT_SCANNER_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(agent, enabledEnv), true);
  assert.equal(canExecuteCanary({ ...agent, tokenId: 3n }, enabledEnv), true);
  assert.equal(canExecuteCanary({ ...agent, censusAddress: adapter }, enabledEnv), false);
  await assert.rejects(
    executeAgentSkill(agent, { chains: ["eip155:11155111"], timeWindowHours: 1 }, { env: {} }),
    RuntimeInactiveError,
  );

  const report = await executeAgentSkill(
    agent,
    { chains: ["eip155:11155111"], timeWindowHours: 1, filters: { minMints: 1 } },
    {
      env: enabledEnv,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      sources: {
        "eip155:11155111": {
          async scanMints({ requestedSince }) {
            return {
              chain: "eip155:11155111",
              requestedSince: requestedSince.toISOString(),
              fromBlock: 1n,
              toBlock: 2n,
              truncated: false,
              events: [],
            };
          },
        },
      },
    },
  );
  assert.equal(report.skill, "Mint Scanner");
  assert.equal(report.reportOnly, true);
});

test("Arbitrageur has an independent skill flag on the active Census contract", async () => {
  const enabledEnv = {
    REPORT_ARBITRAGEUR_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(arbitrageurAgent, enabledEnv), true);
  assert.equal(canExecuteCanary(agent, enabledEnv), false);
  const report = await executeAgentSkill(
    arbitrageurAgent,
    { chain: "eip155:1", collections: ["census-fixture"], minSpreadBps: 100 },
    {
      env: enabledEnv,
      now: () => new Date("2026-08-03T00:00:00.000Z"),
      source: {
        async snapshot() {
          return [{
            kind: "collection",
            id: "census-fixture",
            ask: { amountRaw: "100", decimals: 18, currency: "native" },
            bid: { amountRaw: "101", decimals: 18, currency: "native" },
          }];
        },
      },
    },
  );
  assert.equal(report.skill, "Arbitrageur");
  assert.equal(report.opportunities[0].grossSpreadBps, 100);
});

test("Tracker accepts a matching future agent from the active Census contract", () => {
  const enabledEnv = {
    REPORT_TRACKER_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(trackerAgent, enabledEnv), true);
  assert.equal(canExecuteCanary(arbitrageurAgent, enabledEnv), false);
  assert.equal(canExecuteCanary(trackerAgent, { ...enabledEnv, ACTIVE_CENSUS_ADDRESS: "" }), false);
});

test("Token Hunter has an independent skill flag", () => {
  const enabledEnv = {
    REPORT_TOKEN_HUNTER_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(tokenHunterAgent, enabledEnv), true);
  assert.equal(canExecuteCanary(arbitrageurAgent, enabledEnv), false);
});

test("Trend Reader accepts a matching future agent from the active Census contract", () => {
  const enabledEnv = {
    REPORT_TREND_READER_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(trendReaderAgent, enabledEnv), true);
  assert.equal(canExecuteCanary(tokenHunterAgent, enabledEnv), false);
  assert.equal(canExecuteCanary(trendReaderAgent, { ...enabledEnv, ACTIVE_CENSUS_ADDRESS: "" }), false);
});

test("Fraud Detector has an independent skill flag", () => {
  const enabledEnv = {
    REPORT_FRAUD_DETECTOR_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: census,
  };
  assert.equal(canExecuteCanary(fraudDetectorAgent, enabledEnv), true);
  assert.equal(canExecuteCanary(tokenHunterAgent, enabledEnv), false);
});

test("report-only access rejects invalid active addresses and Executor", () => {
  const enabledEnv = {
    REPORT_MINT_SCANNER_ENABLED: "true",
    ACTIVE_CENSUS_ADDRESS: "not-an-address",
  };
  assert.equal(canExecuteCanary(agent, enabledEnv), false);
  assert.equal(canExecuteCanary({ ...agent, skillIndex: 6 }, {
    ...enabledEnv,
    ACTIVE_CENSUS_ADDRESS: census,
  }), false);
});

test("MCP returns structured canary output through the shared executor", async () => {
  const server = createAgentMcpServer(agent, async () => ({
    skill: "Mint Scanner",
    reportOnly: true,
    chains: [],
  }));
  const client = new Client({ name: "census-canary-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const called = await client.callTool({
      name: "mint-scanner",
      arguments: { chains: ["eip155:11155111"], timeWindowHours: 1 },
    });
    assert.equal(called.isError, undefined);
    assert.equal(called.structuredContent.skill, "Mint Scanner");
    assert.match(called.content[0].text, /reportOnly/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("Viem Mint Scanner source bounds old windows and reads newest chunks first", async () => {
  const ranges = [];
  const source = new ViemMintSource(
    {
      async getBlockNumber() {
        return 100n;
      },
      async getBlock({ blockNumber }) {
        return { timestamp: blockNumber };
      },
      async getLogs({ fromBlock, toBlock }) {
        ranges.push([fromBlock, toBlock]);
        return [];
      },
    },
    { chain: "eip155:11155111", maxBlocks: 20, chunkBlocks: 7 },
  );
  const scan = await source.scanMints({ requestedSince: new Date(0) });
  assert.equal(scan.fromBlock, 81n);
  assert.equal(scan.truncated, true);
  assert.deepEqual(ranges, [[94n, 100n], [87n, 93n], [81n, 86n]]);
});

test("MCP exposes the assigned skill but cannot invoke an inactive runtime", async () => {
  const server = createAgentMcpServer(agent);
  const client = new Client({ name: "census-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), ["mint-scanner"]);
    const called = await client.callTool({
      name: "mint-scanner",
      arguments: { chains: ["eip155:11155111"], timeWindowHours: 24 },
    });
    assert.equal(called.isError, true);
    assert.match(called.content[0].text, /runtime_inactive/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP Streamable HTTP accepts the official initialize handshake", async () => {
  const handler = createAgentMcpHandler(async () => agent);
  const response = await handler.fetch(
    new Request(`${origin}/mcp/${census}/2`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "census-http-test", version: "1.0.0" },
        },
      }),
    }),
  );
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.match(body, /census-mint-scanner/);
  assert.match(body, /"tools"/);
  await handler.close();
});
