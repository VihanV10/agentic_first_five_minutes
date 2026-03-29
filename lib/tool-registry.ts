import type { UserConfig, ToolContext, ToolResult } from "@/lib/types";
import {
  getDeploymentLogs,
  getDeploymentHistory,
} from "@/lib/tools/vercel";
import { getRecentCommits } from "@/lib/tools/github";
import { getDbErrors } from "@/lib/tools/supabase";

/** MCP-style tool list item (JSON Schema draft-07 compatible subset) */
export type MCPToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

type ToolExecutor = (
  config: UserConfig,
  context: ToolContext,
  args: Record<string, unknown>
) => Promise<ToolResult>;

type RegisteredTool = {
  definition: MCPToolDefinition;
  isAvailable: (config: UserConfig) => boolean;
  execute: ToolExecutor;
};

function asRecord(args: unknown): Record<string, unknown> {
  if (args != null && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function readLimit(
  args: Record<string, unknown>,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = args.limit;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

const TOOLS: RegisteredTool[] = [
  {
    definition: {
      name: "get_deployment_logs",
      description:
        "Fetch build and runtime event logs for a Vercel deployment. Pass deployment_id (MCP) or rely on investigation context (web app).",
      inputSchema: {
        type: "object",
        properties: {
          deployment_id: {
            type: "string",
            description:
              "Vercel deployment ID (required for MCP; optional when the host supplies incident context)",
          },
          limit: {
            type: "number",
            description: "Max number of log events (1–200, default 100)",
            minimum: 1,
            maximum: 200,
          },
        },
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: (config, ctx, args) => {
      const limit = readLimit(args, 100, 1, 200);
      const dep =
        typeof args.deployment_id === "string" && args.deployment_id.trim()
          ? args.deployment_id.trim()
          : ctx.deploymentId;
      return getDeploymentLogs(
        config,
        { ...ctx, deploymentId: dep },
        { limit }
      );
    },
  },
  {
    definition: {
      name: "get_deployment_history",
      description:
        "List recent deployments for the Vercel project (states, URLs, timestamps) to compare with the failed deploy.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max deployments to return (1–30, default 10)",
            minimum: 1,
            maximum: 30,
          },
        },
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: (config, ctx, args) => {
      const limit = readLimit(args, 10, 1, 30);
      return getDeploymentHistory(config, ctx, { limit });
    },
  },
  {
    definition: {
      name: "get_recent_commits",
      description:
        "Fetch recent Git commits for the configured repo around the crash time (requires GitHub credentials in settings).",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (c) =>
      !!c.githubToken && !!c.githubOwner && !!c.githubRepo,
    execute: (config, ctx) => getRecentCommits(config, ctx),
  },
  {
    definition: {
      name: "get_db_errors",
      description:
        "Probe Supabase connectivity and basic DB diagnostics (requires Supabase URL and service role key in settings).",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (c) =>
      !!c.supabaseUrl && !!c.supabaseServiceRoleKey,
    execute: (config, ctx) => getDbErrors(config, ctx),
  },
];

const toolByName = new Map(
  TOOLS.map((t) => [t.definition.name, t] as const)
);

export function listToolDefinitionsForConfig(
  config: UserConfig
): MCPToolDefinition[] {
  return TOOLS.filter((t) => t.isAvailable(config)).map((t) => t.definition);
}

/** All definitions (for MCP server; caller filters by env availability) */
export function listAllToolDefinitions(): MCPToolDefinition[] {
  return TOOLS.map((t) => t.definition);
}

export async function executeRegisteredTool(
  name: string,
  config: UserConfig,
  context: ToolContext,
  args: unknown
): Promise<ToolResult> {
  const tool = toolByName.get(name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      source: "tool_registry",
    };
  }
  if (!tool.isAvailable(config)) {
    return {
      success: false,
      error: `Tool not available for this configuration: ${name}`,
      source: "tool_registry",
    };
  }
  return tool.execute(config, context, asRecord(args));
}
