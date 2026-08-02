import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RedisNewsStore } from "./news.js";
import { StandardRedisAdapter, StandardRedisSlidingWindowLimiter } from "./standard-redis.js";

export class RuntimeBackendConfigurationError extends Error {}

let cached;

function upstashCredentials(env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url && !token) return undefined;
  if (!url || !token) throw new RuntimeBackendConfigurationError("Upstash Redis credentials are incomplete");
  return { url, token };
}

export function createRuntimeBackends(env = process.env) {
  const upstash = upstashCredentials(env);
  let redis;
  let limiter;
  if (upstash) {
    redis = new Redis(upstash);
    limiter = (requests, endpoint) =>
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, "1 m"),
        analytics: false,
        prefix: `census:runtime:ratelimit:${endpoint}`,
      });
  } else if (env.REDIS_URL) {
    redis = new StandardRedisAdapter(env.REDIS_URL);
    limiter = (requests, endpoint) =>
      new StandardRedisSlidingWindowLimiter(redis, {
        limit: requests,
        windowMs: 60_000,
        prefix: `census:runtime:ratelimit:${endpoint}`,
      });
  } else {
    throw new RuntimeBackendConfigurationError("durable Redis credentials are missing");
  }

  return {
    news: new RedisNewsStore(redis),
    close: () => redis.close?.(),
    limits: {
      talk: limiter(20, "talk"),
      newsRead: limiter(60, "news-read"),
      newsWrite: limiter(30, "news-write"),
      mcp: limiter(30, "mcp"),
    },
  };
}

export function runtimeBackends(env = process.env) {
  if (env !== process.env) return createRuntimeBackends(env);
  cached ||= createRuntimeBackends(env);
  return cached;
}
