import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

export function createAgentMcpServer(agent) {
  const server = new McpServer(
    { name: `census-${agent.skill.slug}`, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.registerTool(
    agent.skill.slug,
    {
      title: agent.skill.name,
      description: `${agent.skill.description} Runtime activation and payment are not enabled yet.`,
      inputSchema: agent.skill.inputSchema,
      annotations: {
        readOnlyHint: agent.skill.name !== "Executor",
        destructiveHint: agent.skill.name === "Executor",
        idempotentHint: agent.skill.name !== "Executor",
        openWorldHint: true,
      },
    },
    async () => ({
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
    }),
  );
  return server;
}

export function createAgentMcpHandler(resolveAgent) {
  return createMcpHandler(
    async ({ requestInfo }) => {
      if (!requestInfo) throw new Error("MCP request URL is unavailable");
      return createAgentMcpServer(await resolveAgent(new URL(requestInfo.url)));
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
