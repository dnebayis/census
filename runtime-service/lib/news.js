import { randomUUID } from "node:crypto";

const MAX_ITEMS = 100;

export class InMemoryNewsStore {
  constructor() {
    this.items = new Map();
  }

  async append(key, item) {
    const queue = this.items.get(key) || [];
    queue.push(item);
    this.items.set(key, queue.slice(-MAX_ITEMS));
  }

  async list(key) {
    return [...(this.items.get(key) || [])];
  }
}

export function newsKey(agent) {
  return `${agent.censusAddress.toLowerCase()}:${agent.tokenId}`;
}

export function normalizeNewsItem(body, now = () => new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("news item must be a JSON object");
  }
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > 64 * 1024) {
    throw new RangeError("news item exceeds 64 KiB");
  }
  return {
    id: randomUUID(),
    received_at: now().toISOString(),
    payload: body,
  };
}
