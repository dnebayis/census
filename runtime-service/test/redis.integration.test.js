import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRuntimeBackends } from "../lib/backends.js";

const enabled = process.env.RUN_REDIS_INTEGRATION === "1";

test("real Redis stores and bounds passive news", { skip: !enabled }, async () => {
  const backends = createRuntimeBackends(process.env);
  const logicalKey = `integration:${randomUUID()}`;
  const redisKey = backends.news.redisKey(logicalKey);
  try {
    await backends.news.append(logicalKey, { id: "one" });
    assert.deepEqual(await backends.news.list(logicalKey), [{ id: "one" }]);
    assert.equal((await backends.limits.talk.limit(logicalKey)).success, true);
  } finally {
    await backends.news.redis.del(redisKey);
    await backends.close?.();
  }
});
