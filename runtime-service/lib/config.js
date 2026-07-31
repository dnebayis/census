import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { readAgent } from "./agent.js";

export class ConfigurationError extends Error {}

function address(value, name) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value || "")) {
    throw new ConfigurationError(`${name} is missing or invalid`);
  }
  return value;
}

export function parseAgentRoute(query) {
  const rawAddress = Array.isArray(query.censusAddress) ? query.censusAddress[0] : query.censusAddress;
  const rawToken = Array.isArray(query.tokenId) ? query.tokenId[0] : query.tokenId;
  if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddress || "")) {
    throw new TypeError("collection not found");
  }
  if (!/^[1-9][0-9]*$/.test(rawToken || "")) {
    throw new TypeError("token not found");
  }
  return { censusAddress: rawAddress, tokenId: BigInt(rawToken) };
}

export async function readConfiguredAgent(query, env = process.env) {
  const route = parseAgentRoute(query);
  const rpcUrl = env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new ConfigurationError("SEPOLIA_RPC_URL is missing");
  const adapterAddress = address(env.ADAPTER_ADDRESS, "ADAPTER_ADDRESS");
  const chainId = Number(env.CHAIN_ID || sepolia.id);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new ConfigurationError("CHAIN_ID is invalid");
  }
  const client = createPublicClient({
    chain: chainId === sepolia.id ? sepolia : undefined,
    transport: http(rpcUrl),
  });
  return readAgent({ client, adapterAddress, ...route });
}
