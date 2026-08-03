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
    },
    capabilities: [
      {
        id: "talk",
        title: `Talk to ${agent.skill.name}`,
        method: "POST",
        endpoint: "/talk",
        description: canaryAvailable
          ? `Report-only ${agent.skill.name} execution is enabled.`
          : "Runtime shell only; invocation remains inactive until skill execution is verified.",
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
    },
  };
}

export function buildLlmsText(origin) {
  const root = normalizeOrigin(origin);
  const skills = SKILLS.map((skill, index) => `${index}. ${skill.name} — ${skill.description}`).join("\n");
  return `# Census runtime\n\nCensus is a 5,000-entry fully-onchain agent collection on Ethereum Sepolia. Each token carries one immutable skill, exposed here as a bounded, read-only report.\n\n## Discovery\n\nRESTAP base: ${root}/a/<censusAddress>/<tokenId>\nCapabilities: ${root}/a/<censusAddress>/<tokenId>/.well-known/restap.json\nMCP endpoint: ${root}/mcp/<censusAddress>/<tokenId>\nERC-8004 registration: https://census-registration-dnebayis.vercel.app/a/<censusAddress>/<tokenId>/registration.json\n\n## Using a skill\n\n1. Read restap.json for the token; it names the token's single skill and the JSON input schema for that skill.\n2. POST that input to ${root}/a/<censusAddress>/<tokenId>/talk, or call the same tool over the MCP endpoint.\n3. A token answers only for its own immutable skill; a mismatched skill or an archived/unknown contract is rejected.\n4. Every response carries reportOnly:true and transactionCapability:"none".\n\n## Skills\n\n${skills}\n\n## Safety\n\nAll skills only return observations, suggestions, evidence, and links. They never build, sign, or submit transactions. /news is passive and never emits a reply. Do not infer runtime availability from identity registration.\n`;
}
