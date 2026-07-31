import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { MissingBindingError, TokenNotFoundError, readAgent } from "../lib/agent.js";
import { RuntimeBackendConfigurationError, createRuntimeBackends } from "../lib/backends.js";
import { buildCatalog, buildLlmsText, normalizeOrigin } from "../lib/catalog.js";
import { ViemMintSource, normalizeMintScannerInput, runMintScanner } from "../lib/engines/mint-scanner.js";
import { createAgentMcpHandler, createAgentMcpServer } from "../lib/mcp.js";
import { InMemoryNewsStore, RedisNewsStore, newsKey, normalizeNewsItem } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";
import { skillByIndex } from "../lib/skills.js";

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
