import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ViemMintSource, runMintScanner } from "./engines/mint-scanner.js";

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
  return env.UNPAID_MINT_SCANNER_ENABLED === "true" && canaryAgentKeys(env).has(agentKey(agent));
}

export function createMintScannerSources(env = process.env) {
  if (!env.SEPOLIA_RPC_URL) throw new Error("SEPOLIA_RPC_URL is required for Mint Scanner");
  const client = createPublicClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL) });
  return {
    "eip155:11155111": new ViemMintSource(client, { chain: "eip155:11155111" }),
  };
}

export async function executeAgentSkill(
  agent,
  input,
  { env = process.env, sources, now } = {},
) {
  if (!canExecuteCanary(agent, env)) throw new RuntimeInactiveError("runtime_inactive");
  if (agent.skillIndex !== 0) {
    throw new UnsupportedRuntimeSkillError(`skill ${agent.skill.name} is not implemented`);
  }
  return runMintScanner({
    input,
    sources: sources || createMintScannerSources(env),
    ...(now ? { now } : {}),
  });
}
