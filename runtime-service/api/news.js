import { readConfiguredAgent } from "../lib/config.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";
import { InMemoryNewsStore, newsKey, normalizeNewsItem } from "../lib/news.js";

const store = new InMemoryNewsStore();

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body) : body;
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed(response, ["GET", "POST"]);
  try {
    const agent = await readConfiguredAgent(request.query || {});
    const key = newsKey(agent);
    if (request.method === "GET") {
      return json(response, 200, { items: await store.list(key), reply: false });
    }
    let item;
    try {
      item = normalizeNewsItem(parseBody(request.body));
    } catch (error) {
      const message = error instanceof RangeError ? error.message : "invalid news item";
      return json(response, error instanceof RangeError ? 413 : 400, { error: message });
    }
    await store.append(key, item);
    return json(response, 202, { accepted: true, id: item.id, reply: false });
  } catch (error) {
    return chainError(response, error);
  }
}
