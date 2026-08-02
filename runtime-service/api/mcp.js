import { readConfiguredAgent } from "../lib/config.js";
import { runtimeBackends } from "../lib/backends.js";
import { canExecuteCanary, executeAgentSkill } from "../lib/execution.js";
import { chainError, nodeRequestToWeb, webResponseToNode } from "../lib/http.js";
import { createAgentMcpHandler } from "../lib/mcp.js";
import { newsKey } from "../lib/news.js";
import { applyRateLimit, clientKey } from "../lib/rate-limit.js";

export default async function handler(request, response) {
  let mcp;
  try {
    const agent = await readConfiguredAgent(request.query || {});
    const canaryAvailable = canExecuteCanary(agent);
    if (canaryAvailable) {
      const backends = runtimeBackends();
      if (!(await applyRateLimit(response, backends.limits.mcp, `${newsKey(agent)}:${clientKey(request)}`))) return;
    }
    mcp = createAgentMcpHandler(
      async () => agent,
      canaryAvailable ? executeAgentSkill : undefined,
    );
    const webRequest = nodeRequestToWeb(request);
    const webResponse = await mcp.fetch(webRequest, { parsedBody: request.body });
    return await webResponseToNode(webResponse, response);
  } catch (error) {
    return chainError(response, error);
  } finally {
    await mcp?.close();
  }
}
