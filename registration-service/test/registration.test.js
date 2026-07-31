import assert from "node:assert/strict";
import test from "node:test";
import {
  MissingBindingError,
  TokenNotFoundError,
  buildRegistration,
  readRegistration,
} from "../lib/registration.js";
import handler from "../api/registration.js";

const census = "0x1111111111111111111111111111111111111111";
const adapter = "0x2222222222222222222222222222222222222222";
const registry = "0x3333333333333333333333333333333333333333";
const image = "data:image/svg+xml;base64,PHN2Zy8+";
const tokenUri =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify({ image })).toString("base64");

function fakeClient(overrides = {}) {
  return {
    getBlockNumber: async () => 1n,
    readContract: async ({ functionName }) => {
      if (functionName === "ownerOf") return census;
      if (functionName === "agentIdOf") return 42n;
      if (functionName === "metadata") return "0x6b6565707320746865206c6564676572";
      if (functionName === "tokenURI") return tokenUri;
      if (functionName === "bindingOf") {
        return { standard: 0, tokenContract: census, tokenId: 7n };
      }
      throw new Error(`unexpected ${functionName}`);
    },
    ...overrides,
  };
}

function fakeResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("registration-v1 contains the inactive discovery-only shape", () => {
  assert.deepEqual(
    buildRegistration({
      tokenId: "7",
      agentId: 42n,
      identityRegistryAddress: registry,
      chainId: 11155111,
      context: "keeps the ledger",
      image,
    }),
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Census #7",
      description: "keeps the ledger",
      image,
      services: [],
      x402Support: false,
      active: false,
      registrations: [
        {
          agentId: 42,
          agentRegistry: `eip155:11155111:${registry}`,
        },
      ],
      supportedTrust: [],
    },
  );
});

test("reads and verifies Census and adapter state", async () => {
  const result = await readRegistration({
    client: fakeClient(),
    tokenId: 7n,
    censusAddress: census,
    adapterAddress: adapter,
    identityRegistryAddress: registry,
    chainId: 11155111,
  });
  assert.equal(result.registrations[0].agentId, 42);
  assert.equal(result.description, "keeps the ledger");
  assert.equal(result.image, image);
});

test("maps ownerOf revert to token not found", async () => {
  const client = fakeClient({
    readContract: async ({ functionName }) => {
      if (functionName === "ownerOf") throw new Error("revert");
      throw new Error("unexpected");
    },
  });
  await assert.rejects(
    readRegistration({
      client,
      tokenId: 7n,
      censusAddress: census,
      adapterAddress: adapter,
      identityRegistryAddress: registry,
      chainId: 11155111,
    }),
    TokenNotFoundError,
  );
});

test("rejects a mismatched binding", async () => {
  const client = fakeClient({
    readContract: async ({ functionName }) => {
      if (functionName === "ownerOf") return census;
      if (functionName === "agentIdOf") return 42n;
      if (functionName === "metadata") return "0x";
      if (functionName === "tokenURI") return tokenUri;
      if (functionName === "bindingOf") {
        return { standard: 0, tokenContract: registry, tokenId: 7n };
      }
      throw new Error("unexpected");
    },
  });
  await assert.rejects(
    readRegistration({
      client,
      tokenId: 7n,
      censusAddress: census,
      adapterAddress: adapter,
      identityRegistryAddress: registry,
      chainId: 11155111,
    }),
    MissingBindingError,
  );
});

test("does not misclassify an RPC outage as a 404", async () => {
  const client = fakeClient({
    getBlockNumber: async () => {
      throw new Error("upstream unavailable");
    },
  });
  await assert.rejects(
    readRegistration({
      client,
      tokenId: 7n,
      censusAddress: census,
      adapterAddress: adapter,
      identityRegistryAddress: registry,
      chainId: 11155111,
    }),
    /upstream unavailable/,
  );
});

test("HTTP handler returns uncached 404 for an invalid token path", async () => {
  const response = fakeResponse();
  await handler({ query: { tokenId: "-1" } }, response);
  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
});

test("HTTP handler returns 502 when chain configuration is absent", async () => {
  const response = fakeResponse();
  const originalRpc = process.env.SEPOLIA_RPC_URL;
  delete process.env.SEPOLIA_RPC_URL;
  const originalError = console.error;
  console.error = () => {};
  try {
    await handler({ query: { tokenId: "1" } }, response);
  } finally {
    console.error = originalError;
    if (originalRpc !== undefined) process.env.SEPOLIA_RPC_URL = originalRpc;
  }
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.error, "chain data unavailable");
});
