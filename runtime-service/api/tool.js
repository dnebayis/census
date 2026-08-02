import { readConfiguredAgent } from "../lib/config.js";
import { runtimeBackends } from "../lib/backends.js";
import { RuntimeInactiveError, canExecuteCanary, executeAgentSkill } from "../lib/execution.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";
import { newsKey } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";
import { reportToolBySlug } from "../lib/tool-manifest.js";

function parseToolBody(body) {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("request body must be an object");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !["censusAddress", "tokenId", "input"].includes(key))) {
    throw new SyntaxError("request body contains unknown fields");
  }
  if (!value.input || typeof value.input !== "object" || Array.isArray(value.input)) {
    throw new SyntaxError("input must be an object");
  }
  return value;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  let body;
  let tool;
  try {
    body = parseToolBody(request.body);
    tool = reportToolBySlug(request.query?.slug);
  } catch (error) {
    const status = error instanceof TypeError ? 404 : 400;
    return json(response, status, { error: status === 404 ? "tool not found" : "invalid tool input" });
  }

  try {
    const agent = await readConfiguredAgent({
      censusAddress: body.censusAddress,
      tokenId: body.tokenId,
    });
    if (agent.skill.slug !== tool.slug) {
      return json(response, 409, { error: "token skill does not match tool" });
    }
    if (!canExecuteCanary(agent)) return json(response, 503, { error: "runtime_inactive" });
    const backends = runtimeBackends();
    if (!(await applyRateLimit(response, backends.limits.talk, `${newsKey(agent)}:${clientKey(request)}`))) return;
    const result = await executeAgentSkill(agent, body.input);
    return json(response, 200, {
      census: agent.censusAddress,
      tokenId: agent.tokenId.toString(),
      skill: agent.skill.name,
      result,
    });
  } catch (error) {
    if (error instanceof RuntimeInactiveError) return json(response, 503, { error: "runtime_inactive" });
    if (error?.name === "ZodError" || error instanceof TypeError) {
      return json(response, 400, { error: "invalid skill input" });
    }
    return chainError(response, error);
  }
}
