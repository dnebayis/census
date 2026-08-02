import { randomUUID } from "node:crypto";
import { createClient } from "redis";

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local allowed = 0
if count < limit then
  redis.call("ZADD", key, now, member)
  count = count + 1
  allowed = 1
end
redis.call("PEXPIRE", key, window)
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local reset = now + window
if oldest[2] then reset = tonumber(oldest[2]) + window end
return {allowed, count, reset}
`;

export class StandardRedisAdapter {
  constructor(url, client = createClient({ url })) {
    this.client = client;
    this.connecting = undefined;
    this.client.on?.("error", () => console.error("standard Redis connection error"));
  }

  async ready() {
    if (this.client.isOpen) return;
    this.connecting ||= this.client.connect().catch((error) => {
      this.connecting = undefined;
      throw error;
    });
    await this.connecting;
  }

  multi() {
    const commands = [];
    return {
      rpush(key, value) {
        commands.push(["rPush", key, value]);
        return this;
      },
      ltrim(key, start, stop) {
        commands.push(["lTrim", key, start, stop]);
        return this;
      },
      exec: async () => {
        await this.ready();
        const transaction = this.client.multi();
        for (const [method, ...args] of commands) transaction[method](...args);
        return transaction.exec();
      },
    };
  }

  async lrange(key, start, stop) {
    await this.ready();
    return this.client.lRange(key, start, stop);
  }

  async del(key) {
    await this.ready();
    return this.client.del(key);
  }

  async evalSlidingWindow(key, { now, windowMs, limit, member }) {
    await this.ready();
    return this.client.eval(SLIDING_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [String(now), String(windowMs), String(limit), member],
    });
  }

  async close() {
    if (this.client.isOpen) await this.client.close();
  }
}

export class StandardRedisSlidingWindowLimiter {
  constructor(redis, { limit, windowMs, prefix }) {
    this.redis = redis;
    this.limitValue = limit;
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  async limit(identifier, now = Date.now()) {
    const [allowed, count, reset] = await this.redis.evalSlidingWindow(
      `${this.prefix}:${identifier}`,
      {
        now,
        windowMs: this.windowMs,
        limit: this.limitValue,
        member: `${now}:${randomUUID()}`,
      },
    );
    return {
      success: Number(allowed) === 1,
      limit: this.limitValue,
      remaining: Math.max(0, this.limitValue - Number(count)),
      reset: Number(reset),
    };
  }
}
