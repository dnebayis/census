import { createHash } from "node:crypto";

function firstHeader(value) {
  return String(value || "").split(",")[0].trim();
}

export function clientKey(request) {
  const forwarded = firstHeader(
    request.headers?.["x-vercel-forwarded-for"] || request.headers?.["x-forwarded-for"],
  );
  const address = forwarded || request.socket?.remoteAddress || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

export async function applyRateLimit(response, limiter, identifier) {
  const result = await limiter.limit(identifier);
  response.setHeader("X-RateLimit-Limit", String(result.limit));
  response.setHeader("X-RateLimit-Remaining", String(result.remaining));
  response.setHeader("X-RateLimit-Reset", String(result.reset));
  if (result.success) return true;

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  response.setHeader("Retry-After", String(retryAfter));
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(429).json({ error: "rate limit exceeded" });
  return false;
}
