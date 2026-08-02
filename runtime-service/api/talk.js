import { readConfiguredAgent } from "../lib/config.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";
import { runtimeBackends } from "../lib/backends.js";
import { RuntimeInactiveError, canExecuteCanary, executeAgentSkill } from "../lib/execution.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";
import { newsKey } from "../lib/news.js";

function parseBody(body) {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("request body must be a JSON object");
  }
  return value;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  let input;
  try {
    input = parseBody(request.body);
  } catch {
    return json(response, 400, { error: "invalid JSON request" });
  }
  try {
    const agent = await readConfiguredAgent(request.query || {});
    if (!canExecuteCanary(agent)) {
      return json(response, 503, { error: "runtime_inactive", x402Support: false });
    }
    const backends = runtimeBackends();
    if (!(await applyRateLimit(response, backends.limits.talk, `${newsKey(agent)}:${clientKey(request)}`))) return;
    const result = await executeAgentSkill(agent, input);
    return json(response, 200, {
      canary: true,
      census: agent.censusAddress,
      tokenId: agent.tokenId.toString(),
      skill: agent.skill.name,
      x402Support: false,
      result,
    });
  } catch (error) {
    if (error instanceof RuntimeInactiveError) {
      return json(response, 503, { error: "runtime_inactive", x402Support: false });
    }
    if (error?.name === "ZodError" || error instanceof TypeError) {
      return json(response, 400, { error: "invalid skill input" });
    }
    return chainError(response, error);
  }
}
