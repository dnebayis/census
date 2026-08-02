import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

export function createAgentMcpServer(agent, execute) {
  const server = new McpServer(
    { name: `census-${agent.skill.slug}`, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.registerTool(
    agent.skill.slug,
    {
      title: agent.skill.name,
      description: `${agent.skill.description} ${execute ? "Report-only execution is enabled." : "Runtime execution is not enabled yet."}`,
      inputSchema: agent.skill.inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      if (!execute) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "runtime_inactive",
                census: agent.censusAddress,
                tokenId: agent.tokenId.toString(),
                skill: agent.skill.name,
              }),
            },
          ],
        };
      }
      try {
        const result = await execute(agent, input);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: error.message || "execution_failed" }) }],
        };
      }
    },
  );
  return server;
}

export function createAgentMcpHandler(resolveAgent, execute) {
  return createMcpHandler(
    async ({ requestInfo }) => {
      if (!requestInfo) throw new Error("MCP request URL is unavailable");
      return createAgentMcpServer(await resolveAgent(new URL(requestInfo.url)), execute);
    },
    {
      legacy: "stateless",
      responseMode: "auto",
      onerror(error) {
        console.error("mcp request failed", error.message);
      },
    },
  );
}
