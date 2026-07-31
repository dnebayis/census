import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RedisNewsStore } from "./news.js";

export class RuntimeBackendConfigurationError extends Error {}

let cached;

function redisCredentials(env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new RuntimeBackendConfigurationError("durable Redis credentials are missing");
  }
  return { url, token };
}

export function createRuntimeBackends(env = process.env) {
  const redis = new Redis(redisCredentials(env));
  const limiter = (requests, duration, endpoint) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, duration),
      analytics: false,
      prefix: `census:runtime:ratelimit:${endpoint}`,
    });

  return {
    news: new RedisNewsStore(redis),
    limits: {
      talk: limiter(20, "1 m", "talk"),
      newsRead: limiter(60, "1 m", "news-read"),
      newsWrite: limiter(30, "1 m", "news-write"),
      mcp: limiter(30, "1 m", "mcp"),
    },
  };
}

export function runtimeBackends(env = process.env) {
  if (env !== process.env) return createRuntimeBackends(env);
  cached ||= createRuntimeBackends(env);
  return cached;
}
