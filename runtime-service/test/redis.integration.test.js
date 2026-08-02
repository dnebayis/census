import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { RedisNewsStore } from "../lib/news.js";

const enabled = process.env.RUN_REDIS_INTEGRATION === "1";

test("real Redis stores and bounds passive news", { skip: !enabled }, async () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  assert.ok(url && token, "Redis integration credentials are required");

  const redis = new Redis({ url, token });
  const prefix = `census:test:${randomUUID()}`;
  const store = new RedisNewsStore(redis, { prefix, maxItems: 2 });
  const logicalKey = "agent";
  try {
    await store.append(logicalKey, { id: "one" });
    await store.append(logicalKey, { id: "two" });
    await store.append(logicalKey, { id: "three" });
    assert.deepEqual(await store.list(logicalKey), [{ id: "two" }, { id: "three" }]);
  } finally {
    await redis.del(store.redisKey(logicalKey));
  }
});
