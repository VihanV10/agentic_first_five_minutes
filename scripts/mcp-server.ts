/**
 * MCP stdio server exposing the same incident-investigation tools as the web app.
 * Configure Cursor (or another MCP host) with command: npx tsx scripts/mcp-server.ts
 * Run from the project root; set env vars below.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  listAllToolDefinitions,
  listToolDefinitionsForConfig,
  executeRegisteredTool,
} from "@/lib/tool-registry";
import type { UserConfig, ToolContext } from "@/lib/types";

function userConfigFromEnv(): UserConfig | null {
  const vercelToken = process.env.VERCEL_TOKEN?.trim();
  const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!vercelToken || !vercelProjectId) return null;
  return {
    vercelToken,
    vercelProjectId,
    vercelTeamId: process.env.VERCEL_TEAM_ID?.trim() || undefined,
    githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
    githubOwner: process.env.GITHUB_OWNER?.trim() || undefined,
    githubRepo: process.env.GITHUB_REPO?.trim() || undefined,
    supabaseUrl: process.env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    pollingIntervalSeconds: 60,
  };
}

function toolContextFromEnv(): ToolContext {
  const dep = process.env.MCP_DEFAULT_DEPLOYMENT_ID?.trim();
  const ts = process.env.MCP_DEFAULT_CRASH_TIMESTAMP_MS?.trim();
  const timestamp = ts ? parseInt(ts, 10) : undefined;
  return {
    deploymentId: dep || undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

const server = new Server(
  { name: "first-five-minutes", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const config = userConfigFromEnv();
  const tools = (
    config ? listToolDefinitionsForConfig(config) : listAllToolDefinitions()
  ).map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.inputSchema as Record<string, unknown>,
  }));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const config = userConfigFromEnv();
  if (!config) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error:
              "Missing VERCEL_TOKEN and VERCEL_PROJECT_ID in environment.",
          }),
        },
      ],
      isError: true,
    };
  }

  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const baseCtx = toolContextFromEnv();
  const result = await executeRegisteredTool(name, config, baseCtx, args);
  const text = JSON.stringify(result, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    isError: !result.success,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
