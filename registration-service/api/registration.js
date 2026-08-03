import { createPublicClient, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import {
  ConfigurationError,
  MissingBindingError,
  TokenNotFoundError,
  readRegistration,
} from "../lib/registration.js";

const UINT256_MAX = (1n << 256n) - 1n;
const inFlight = new Map();
let cachedClient;
let cachedRpcKey;

function json(response, status, body, cacheControl = "no-store, max-age=0") {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControl);
  return response.status(status).json(body);
}

function rpcUrls(env) {
  const combined = env.SEPOLIA_RPC_URLS || env.SEPOLIA_RPC_URL;
  const urls = String(combined || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!urls.length) throw new ConfigurationError("SEPOLIA_RPC_URLS is missing");
  return [...new Set(urls)];
}

function publicClient(urls, chainId) {
  const key = `${chainId}:${urls.join(",")}`;
  if (cachedClient && cachedRpcKey === key) return cachedClient;
  const transports = urls.map((url) => http(url, { timeout: 5_000, retryCount: 1 }));
  cachedRpcKey = key;
  cachedClient = createPublicClient({
    chain: chainId === sepolia.id ? sepolia : undefined,
    transport: transports.length === 1 ? transports[0] : fallback(transports, { rank: false }),
  });
  return cachedClient;
}

function coalesce(key, operation) {
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = operation().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

function requiredAddress(name) {
  const value = process.env[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(value || "")) {
    throw new ConfigurationError(`${name} is missing or invalid`);
  }
  return value;
}

export default async function handler(request, response) {
  try {
    const raw = Array.isArray(request.query.tokenId)
      ? request.query.tokenId[0]
      : request.query.tokenId;
    if (!/^(0|[1-9][0-9]{0,77})$/.test(raw || "") || BigInt(raw) > UINT256_MAX) {
      return json(response, 404, { error: "token not found" }, "public, max-age=0, s-maxage=30");
    }
    const rawCensusAddress = Array.isArray(request.query.censusAddress)
      ? request.query.censusAddress[0]
      : request.query.censusAddress;
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawCensusAddress || "")) {
      return json(response, 404, { error: "collection not found" }, "public, max-age=0, s-maxage=30");
    }

    const censusAddress = rawCensusAddress;
    const adapterAddress = requiredAddress("ADAPTER_ADDRESS");
    const identityRegistryAddress = requiredAddress("IDENTITY_REGISTRY_ADDRESS");
    const chainId = Number(process.env.CHAIN_ID || sepolia.id);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new ConfigurationError("CHAIN_ID is invalid");
    }

    const client = publicClient(rpcUrls(process.env), chainId);
    const tokenId = BigInt(raw);
    const registration = await coalesce(`${chainId}:${censusAddress.toLowerCase()}:${raw}`, () =>
      readRegistration({ client, tokenId, censusAddress, adapterAddress, identityRegistryAddress, chainId })
    );
    const active = String(process.env.ACTIVE_CENSUS_ADDRESS || "").toLowerCase();
    const cache = active && active === censusAddress.toLowerCase()
      ? "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
      : "no-store, max-age=0";
    return json(response, 200, registration, cache);
  } catch (error) {
    if (error instanceof TokenNotFoundError) {
      return json(response, 404, { error: "token not found" }, "public, max-age=0, s-maxage=30");
    }
    const kind =
      error instanceof MissingBindingError
        ? "agent binding unavailable"
        : "chain data unavailable";
    console.error(kind, error instanceof Error ? error.message : String(error));
    return json(response, 502, { error: kind });
  }
}
