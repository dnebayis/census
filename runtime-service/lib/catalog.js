import { z } from "zod";
import { SKILLS } from "./skills.js";

export function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.startsWith("https://") || value.endsWith("/")) {
    throw new Error("RUNTIME_ORIGIN must be an https origin without a trailing slash");
  }
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("RUNTIME_ORIGIN must not include a path, query, or fragment");
  }
  return url.origin;
}

export function agentBasePath(agent) {
  return `/a/${agent.censusAddress.toLowerCase()}/${agent.tokenId}`;
}

export function buildCatalog(agent, origin, { canaryAvailable = false } = {}) {
  const basePath = agentBasePath(agent);
  const baseUrl = `${normalizeOrigin(origin)}${basePath}`;
  const inputSchema = z.toJSONSchema(agent.skill.inputSchema);
  return {
    restap_version: "1.0",
    protocol_snapshot: "nxt3d/restap@5d7222692a0d1c53fbb03091b94de6c732cac2bc",
    agent: {
      name: `Census #${agent.tokenId}`,
      description: agent.context,
      base_url: baseUrl,
      census: agent.censusAddress,
      token_id: agent.tokenId.toString(),
      agent_id: agent.agentId.toString(),
      owner: agent.owner,
      class: agent.className,
      skill: agent.skill.name,
    },
    active: false,
    canary: {
      available: canaryAvailable,
      unpaid: canaryAvailable,
    },
    capabilities: [
      {
        id: "talk",
        title: `Talk to ${agent.skill.name}`,
        method: "POST",
        endpoint: "/talk",
        description: canaryAvailable
          ? "Unpaid Mint Scanner canary; production activation and payment remain disabled."
          : "Runtime shell only; invocation remains inactive until payment and skill execution are verified.",
        input_schema: inputSchema,
        output_formats: ["application/json"],
      },
      {
        id: "news",
        title: "Read passive updates",
        method: "GET",
        endpoint: "/news",
        description: "Reads queued updates and never triggers an agent reply.",
      },
      {
        id: "news_receive",
        title: "Deliver a passive update",
        method: "POST",
        endpoint: "/news",
        description: "Accepts an update without invoking the LLM or emitting a reply.",
      },
    ],
    protocols: {
      mcp: {
        available: true,
        endpoint: `${normalizeOrigin(origin)}/mcp/${agent.censusAddress.toLowerCase()}/${agent.tokenId}`,
        transport: "streamable-http",
        protocol_version: "2026-07-28",
      },
      x402: { available: false },
    },
  };
}

export function buildLlmsText(origin) {
  const root = normalizeOrigin(origin);
  const skills = SKILLS.map((skill, index) => `${index}. ${skill.name} — ${skill.description}`).join("\n");
  return `# Census runtime\n\nCensus is a 10,000-entry onchain agent collection. The shared runtime is currently an inactive protocol shell.\n\n## Discovery\n\nRESTAP base: ${root}/a/<censusAddress>/<tokenId>\nMCP endpoint: ${root}/mcp/<censusAddress>/<tokenId>\nERC-8004 registration: https://census-registration-dnebayis.vercel.app/a/<censusAddress>/<tokenId>/registration.json\n\n## Skills\n\n${skills}\n\n## Safety\n\n/news is passive and never emits a reply. Paid invocation, wallets, x402 settlement, and Executor are not active. Do not infer runtime availability from identity registration.\n`;
}
