import { z } from "zod";

const chainList = z.array(z.string().min(1)).min(1).max(16);

export const SKILLS = [
  {
    name: "Mint Scanner",
    slug: "mint-scanner",
    description: "Scans new deploys and drops and returns evidence-backed candidates.",
    inputSchema: z.object({
      chains: chainList,
      timeWindowHours: z.number().positive().max(720),
      filters: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  {
    name: "Arbitrageur",
    slug: "arbitrageur",
    description: "Finds mispricing and below-floor opportunities.",
    inputSchema: z.object({
      chain: z.enum(["eip155:1", "eip155:11155111"]).default("eip155:1"),
      collections: z.array(z.string()).max(20).optional(),
      watchlist: z.array(z.string()).max(20).optional(),
      minSpreadBps: z.number().int().min(0).max(100000),
    }),
  },
  {
    name: "Tracker",
    slug: "tracker",
    description: "Watches wallets and reports evidence-backed movements.",
    inputSchema: z.object({
      chain: z.enum(["eip155:1", "eip155:11155111"]).default("eip155:1"),
      wallets: z.array(z.string()).min(1).max(10),
      since: z.string().datetime(),
      eventTypes: z.array(z.enum(["transfer", "sale", "mint"])).min(1).max(3).default(["transfer", "sale", "mint"]),
      maxMovements: z.number().int().min(1).max(200).default(50),
    }),
  },
  {
    name: "Token Hunter",
    slug: "token-hunter",
    description: "Finds young trending tokens with evidence-backed volume and safety signals.",
    inputSchema: z.object({
      chain: z.enum(["eip155:1", "eip155:11155111"]).default("eip155:1"),
      minVolume24hUsd: z.number().nonnegative(),
      maxAgeHours: z.number().positive().max(8760),
      maxCandidates: z.number().int().min(1).max(20).default(10),
    }),
  },
  {
    name: "Trend Reader",
    slug: "trend-reader",
    description: "Reports OpenSea trending collections with bounded market evidence.",
    inputSchema: z.object({
      chain: z.enum(["eip155:1", "eip155:11155111"]).default("eip155:1"),
      timeframe: z.enum(["1h", "24h", "7d"]),
      category: z.enum(["art", "gaming", "memberships", "music", "pfps", "photography", "domain-names", "virtual-worlds", "sports-collectibles", "physical-collectibles"]).optional(),
      maxCollections: z.number().int().min(1).max(10).default(10),
    }),
  },
  {
    name: "Fraud Detector",
    slug: "fraud-detector",
    description: "Assesses collections or wallets for fraud signals.",
    inputSchema: z.object({
      target: z.object({
        type: z.enum(["collection", "wallet"]),
        id: z.string().min(1),
      }),
    }),
  },
  {
    name: "Executor",
    slug: "executor",
    description: "Executes a bounded action after explicit authorization and simulation.",
    inputSchema: z.object({
      condition: z.record(z.string(), z.unknown()),
      action: z.record(z.string(), z.unknown()),
      budget: z.record(z.string(), z.unknown()),
      expiry: z.string().datetime(),
    }),
  },
];

export function skillByIndex(index) {
  const skill = SKILLS[Number(index)];
  if (!skill) throw new Error(`unsupported Census skill index ${index}`);
  return skill;
}
