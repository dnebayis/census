import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { OpenSeaMarketSource, runArbitrageur } from "./engines/arbitrageur.js";
import { ViemMintSource, runMintScanner } from "./engines/mint-scanner.js";
import { OpenSeaTrackerSource, runTracker } from "./engines/tracker.js";
import { OpenSeaTokenHunterSource, runTokenHunter } from "./engines/token-hunter.js";
import { OpenSeaTrendReaderSource, runTrendReader } from "./engines/trend-reader.js";
import { OpenSeaFraudDetectorSource, runFraudDetector } from "./engines/fraud-detector.js";

export class RuntimeInactiveError extends Error {}
export class UnsupportedRuntimeSkillError extends Error {}

export function agentKey(agent) {
  return `${agent.censusAddress.toLowerCase()}:${agent.tokenId}`;
}

export function canaryAgentKeys(env = process.env) {
  return new Set(
    String(env.CANARY_AGENT_KEYS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canExecuteCanary(agent, env = process.env) {
  const flag = new Map([
    [0, "UNPAID_MINT_SCANNER_ENABLED"],
    [1, "UNPAID_ARBITRAGEUR_ENABLED"],
    [2, "UNPAID_TRACKER_ENABLED"],
    [3, "UNPAID_TOKEN_HUNTER_ENABLED"],
    [4, "UNPAID_TREND_READER_ENABLED"],
    [5, "UNPAID_FRAUD_DETECTOR_ENABLED"],
  ]).get(agent.skillIndex);
  return Boolean(flag) && env[flag] === "true" && canaryAgentKeys(env).has(agentKey(agent));
}

export function createMintScannerSources(env = process.env) {
  if (!env.SEPOLIA_RPC_URL) throw new Error("SEPOLIA_RPC_URL is required for Mint Scanner");
  const client = createPublicClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL) });
  return {
    "eip155:11155111": new ViemMintSource(client, { chain: "eip155:11155111" }),
  };
}

export function createArbitrageurSource(env = process.env) {
  return new OpenSeaMarketSource({ apiKey: env.OPENSEA_API_KEY });
}

export function createTrackerSource(env = process.env) {
  return new OpenSeaTrackerSource({ apiKey: env.OPENSEA_API_KEY });
}

export function createTokenHunterSource(env = process.env) {
  return new OpenSeaTokenHunterSource({ apiKey: env.OPENSEA_API_KEY });
}

export function createTrendReaderSource(env = process.env) {
  return new OpenSeaTrendReaderSource({ apiKey: env.OPENSEA_API_KEY });
}

export function createFraudDetectorSource(env = process.env) {
  return new OpenSeaFraudDetectorSource({ apiKey: env.OPENSEA_API_KEY });
}

export async function executeAgentSkill(
  agent,
  input,
  { env = process.env, sources, source, now } = {},
) {
  if (!canExecuteCanary(agent, env)) throw new RuntimeInactiveError("runtime_inactive");
  if (agent.skillIndex === 0) {
    return runMintScanner({
      input,
      sources: sources || createMintScannerSources(env),
      ...(now ? { now } : {}),
    });
  }
  if (agent.skillIndex === 1) {
    return runArbitrageur({
      input,
      source: source || createArbitrageurSource(env),
      ...(now ? { now } : {}),
    });
  }
  if (agent.skillIndex === 2) {
    return runTracker({
      input,
      source: source || createTrackerSource(env),
      ...(now ? { now } : {}),
    });
  }
  if (agent.skillIndex === 3) {
    return runTokenHunter({
      input,
      source: source || createTokenHunterSource(env),
      ...(now ? { now } : {}),
    });
  }
  if (agent.skillIndex === 4) {
    return runTrendReader({
      input,
      source: source || createTrendReaderSource(env),
      ...(now ? { now } : {}),
    });
  }
  if (agent.skillIndex === 5) {
    return runFraudDetector({
      input,
      source: source || createFraudDetectorSource(env),
      ...(now ? { now } : {}),
    });
  }
  throw new UnsupportedRuntimeSkillError(`skill ${agent.skill.name} is not implemented`);
}
