import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  ConfigurationError,
  MissingBindingError,
  TokenNotFoundError,
  readRegistration,
} from "../lib/registration.js";

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  return response.status(status).json(body);
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
    if (!/^(0|[1-9][0-9]*)$/.test(raw || "")) {
      return json(response, 404, { error: "token not found" });
    }
    const rawCensusAddress = Array.isArray(request.query.censusAddress)
      ? request.query.censusAddress[0]
      : request.query.censusAddress;
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawCensusAddress || "")) {
      return json(response, 404, { error: "collection not found" });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw new ConfigurationError("SEPOLIA_RPC_URL is missing");

    const censusAddress = rawCensusAddress;
    const adapterAddress = requiredAddress("ADAPTER_ADDRESS");
    const identityRegistryAddress = requiredAddress("IDENTITY_REGISTRY_ADDRESS");
    const chainId = Number(process.env.CHAIN_ID || sepolia.id);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new ConfigurationError("CHAIN_ID is invalid");
    }

    const client = createPublicClient({
      chain: chainId === sepolia.id ? sepolia : undefined,
      transport: http(rpcUrl),
    });
    const registration = await readRegistration({
      client,
      tokenId: BigInt(raw),
      censusAddress,
      adapterAddress,
      identityRegistryAddress,
      chainId,
    });
    return json(response, 200, registration);
  } catch (error) {
    if (error instanceof TokenNotFoundError) {
      return json(response, 404, { error: "token not found" });
    }
    const kind =
      error instanceof MissingBindingError
        ? "agent binding unavailable"
        : "chain data unavailable";
    console.error(kind, error instanceof Error ? error.message : String(error));
    return json(response, 502, { error: kind });
  }
}
