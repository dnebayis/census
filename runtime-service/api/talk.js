import { readConfiguredAgent } from "../lib/config.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";

function parseBody(body) {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("request body must be a JSON object");
  }
  return value;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    parseBody(request.body);
  } catch {
    return json(response, 400, { error: "invalid JSON request" });
  }
  try {
    const agent = await readConfiguredAgent(request.query || {});
    return json(response, 503, {
      error: "runtime_inactive",
      census: agent.censusAddress,
      tokenId: agent.tokenId.toString(),
      skill: agent.skill.name,
      x402Support: false,
    });
  } catch (error) {
    return chainError(response, error);
  }
}
