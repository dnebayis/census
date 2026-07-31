import { readConfiguredAgent } from "../lib/config.js";
import { nodeRequestToWeb, webResponseToNode } from "../lib/http.js";
import { createAgentMcpHandler } from "../lib/mcp.js";

const mcp = createAgentMcpHandler(async (url) =>
  readConfiguredAgent(Object.fromEntries(url.searchParams.entries())),
);

export default async function handler(request, response) {
  const webRequest = nodeRequestToWeb(request);
  const webResponse = await mcp.fetch(webRequest, { parsedBody: request.body });
  return webResponseToNode(webResponse, response);
}
