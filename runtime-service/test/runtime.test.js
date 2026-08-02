import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
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
import { RuntimeInactiveError, canExecuteCanary, executeAgentSkill } from "../lib/execution.js";
import { createAgentMcpHandler, createAgentMcpServer } from "../lib/mcp.js";
import { InMemoryNewsStore, RedisNewsStore, newsKey, normalizeNewsItem } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";
import { skillByIndex } from "../lib/skills.js";
import { StandardRedisAdapter, StandardRedisSlidingWindowLimiter } from "../lib/standard-redis.js";

const census = "0x1111111111111111111111111111111111111111";
const adapter = "0x2222222222222222222222222222222222222222";
const owner = "0x3333333333333333333333333333333333333333";
const origin = "https://census-runtime.example";

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
  assert.equal(canaryCatalog.capabilities[0].description, "Unpaid Arbitrageur canary; payment remains disabled.");
  assert.equal(catalog.capabilities[1].endpoint, "/news");
  assert.equal(catalog.protocols.mcp.transport, "streamable-http");
  assert.equal(catalog.protocols.x402.available, false);
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

test("only the doubly-gated Mint Scanner canary can execute", async () => {
  const enabledEnv = {
    UNPAID_MINT_SCANNER_ENABLED: "true",
    CANARY_AGENT_KEYS: `${census}:2`,
  };
  assert.equal(canExecuteCanary(agent, enabledEnv), true);
  assert.equal(canExecuteCanary({ ...agent, tokenId: 3n }, enabledEnv), false);
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

test("Arbitrageur has an independent double-gated canary", async () => {
  const enabledEnv = {
    UNPAID_ARBITRAGEUR_ENABLED: "true",
    CANARY_AGENT_KEYS: `${census}:3`,
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
