import { MissingBindingError, TokenNotFoundError } from "./agent.js";
import { RuntimeBackendConfigurationError } from "./backends.js";
import { ConfigurationError } from "./config.js";
import { MarketDataUnavailableError } from "./engines/arbitrageur.js";
import { TrackerDataUnavailableError } from "./engines/tracker.js";
import { TokenHunterDataUnavailableError } from "./engines/token-hunter.js";

export function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  return response.status(status).json(body);
}

export function text(response, status, body) {
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  return response.status(status).send(body);
}

export function methodNotAllowed(response, allowed) {
  response.setHeader("Allow", allowed.join(", "));
  return json(response, 405, { error: "method not allowed" });
}

export function chainError(response, error) {
  if (error instanceof TokenNotFoundError || error instanceof TypeError) {
    return json(response, 404, { error: error.message || "token not found" });
  }
  let kind = "chain data unavailable";
  if (error instanceof MissingBindingError) kind = "agent binding unavailable";
  if (error instanceof ConfigurationError) kind = "chain configuration unavailable";
  if (error instanceof RuntimeBackendConfigurationError) kind = "runtime backend unavailable";
  if (error instanceof MarketDataUnavailableError) kind = "market data unavailable";
  if (error instanceof TrackerDataUnavailableError) kind = "tracker data unavailable";
  if (error instanceof TokenHunterDataUnavailableError) kind = "token hunter data unavailable";
  console.error(kind, error instanceof Error ? error.message : String(error));
  return json(response, 502, { error: kind });
}

export function nodeRequestToWeb(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, String(value));
  }
  const method = request.method || "POST";
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  }
  return new Request(`https://runtime.invalid${request.url || "/api/mcp"}`, init);
}

export async function webResponseToNode(source, target) {
  source.headers.forEach((value, name) => target.setHeader(name, value));
  const body = Buffer.from(await source.arrayBuffer());
  return target.status(source.status).send(body);
}
