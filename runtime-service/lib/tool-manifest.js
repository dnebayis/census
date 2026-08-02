import canonicalize from "canonicalize";
import { keccak256, stringToBytes } from "viem";
import { z } from "zod";
import { normalizeOrigin } from "./catalog.js";
import { SKILLS } from "./skills.js";

export const ERC8257_MANIFEST_TYPE = "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1";
export const REPORT_TOOLS = SKILLS;

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const TOKEN_PATTERN = "^[1-9][0-9]*$";

export function reportToolBySlug(slug) {
  const value = Array.isArray(slug) ? slug[0] : slug;
  const tool = REPORT_TOOLS.find(({ slug: candidate }) => candidate === value);
  if (!tool) throw new TypeError("tool not found");
  return tool;
}

export function normalizeCreatorAddress(value) {
  const creator = String(value || "").trim();
  if (!ADDRESS_PATTERN.test(creator)) {
    throw new Error("ERC8257_CREATOR_ADDRESS must be a lowercase nonzero EVM address");
  }
  if (creator === "0x0000000000000000000000000000000000000000") {
    throw new Error("ERC8257_CREATOR_ADDRESS must not be zero");
  }
  return creator;
}

function tagsFor(skill) {
  const tags = new Set(["ai", "nft", "census", "report-only"]);
  if (["Arbitrageur", "Token Hunter", "Trend Reader"].includes(skill.name)) tags.add("trading");
  if (skill.name === "Fraud Detector") tags.add("security");
  return [...tags];
}

export function buildToolManifest(skill, origin, creatorAddress) {
  const runtimeOrigin = normalizeOrigin(origin);
  const creator = normalizeCreatorAddress(creatorAddress);
  return {
    type: ERC8257_MANIFEST_TYPE,
    name: `census-${skill.slug}`,
    description: `${skill.description} Uses the immutable skill of a bound active Census token and never builds, signs, or submits a transaction.`,
    endpoint: `${runtimeOrigin}/tools/${skill.slug}`,
    inputs: {
      type: "object",
      properties: {
        censusAddress: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "Active Census contract address.",
        },
        tokenId: {
          type: "string",
          pattern: TOKEN_PATTERN,
          description: "Census token whose immutable skill invokes this tool.",
        },
        input: z.toJSONSchema(skill.inputSchema),
      },
      required: ["censusAddress", "tokenId", "input"],
      additionalProperties: false,
    },
    outputs: {
      type: "object",
      properties: {
        census: { type: "string" },
        tokenId: { type: "string" },
        skill: { type: "string", const: skill.name },
        result: { type: "object" },
      },
      required: ["census", "tokenId", "skill", "result"],
      additionalProperties: false,
    },
    version: "1.0.0",
    tags: tagsFor(skill),
    creatorAddress: creator,
  };
}

export function buildToolManifestBySlug(slug, env = process.env) {
  return buildToolManifest(
    reportToolBySlug(slug),
    env.RUNTIME_ORIGIN,
    env.ERC8257_CREATOR_ADDRESS,
  );
}

export function canonicalManifest(manifest) {
  const value = canonicalize(manifest);
  if (typeof value !== "string") throw new Error("manifest cannot be canonicalized");
  return value;
}

export function manifestHash(manifest) {
  return keccak256(stringToBytes(canonicalManifest(manifest)));
}
