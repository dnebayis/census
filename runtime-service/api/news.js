import { readConfiguredAgent } from "../lib/config.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";
import { runtimeBackends } from "../lib/backends.js";
import { newsKey, normalizeNewsItem } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body) : body;
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed(response, ["GET", "POST"]);
  try {
    const agent = await readConfiguredAgent(request.query || {});
    const key = newsKey(agent);
    const backends = runtimeBackends();
    const limiter = request.method === "GET" ? backends.limits.newsRead : backends.limits.newsWrite;
    if (!(await applyRateLimit(response, limiter, `${key}:${clientKey(request)}`))) return;
    if (request.method === "GET") {
      return json(response, 200, { items: await backends.news.list(key), reply: false });
    }
    let item;
    try {
      item = normalizeNewsItem(parseBody(request.body));
    } catch (error) {
      const message = error instanceof RangeError ? error.message : "invalid news item";
      return json(response, error instanceof RangeError ? 413 : 400, { error: message });
    }
    await backends.news.append(key, item);
    return json(response, 202, { accepted: true, id: item.id, reply: false });
  } catch (error) {
    return chainError(response, error);
  }
}
