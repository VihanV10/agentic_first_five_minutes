import type { UserConfig, ToolContext, ToolResult } from "@/lib/types";

const VERCEL_API = "https://api.vercel.com";

/** Get deployment build/event logs for a given deployment */
export async function getDeploymentLogs(
  config: UserConfig,
  context?: ToolContext
): Promise<ToolResult> {
  const id = context?.deploymentId;
  if (!id) {
    return {
      success: false,
      error: "No deploymentId in context",
      source: "vercel_logs",
    };
  }
  try {
    const url = new URL(`/v3/deployments/${id}/events`, VERCEL_API);
    url.searchParams.set("limit", "100");
    if (config.vercelTeamId) url.searchParams.set("teamId", config.vercelTeamId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.vercelToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `Vercel API ${res.status}: ${text.slice(0, 500)}`,
        source: "vercel_logs",
      };
    }
    const raw = await res.json();
    const events = Array.isArray(raw) ? raw : raw.events ?? [];
    const summary = events.map((e: { type?: string; text?: string; created?: number; payload?: unknown }) => ({
      type: e.type,
      text: e.text ?? (e.payload && typeof e.payload === "object" && "text" in e.payload ? String((e.payload as { text?: string }).text) : undefined),
      created: e.created,
    }));
    return {
      success: true,
      data: { deploymentId: id, events: summary, total: events.length },
      source: "vercel_logs",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: "vercel_logs",
    };
  }
}

/** Get recent deployment history for the project */
export async function getDeploymentHistory(
  config: UserConfig,
  context?: ToolContext
): Promise<ToolResult> {
  void context;
  try {
    const url = new URL("/v6/deployments", VERCEL_API);
    url.searchParams.set("projectId", config.vercelProjectId);
    url.searchParams.set("limit", "10");
    if (config.vercelTeamId) url.searchParams.set("teamId", config.vercelTeamId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.vercelToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `Vercel API ${res.status}: ${text.slice(0, 500)}`,
        source: "vercel_history",
      };
    }
    const data = await res.json();
    const deployments = data.deployments ?? data ?? [];
    const list = deployments.map((d: { uid?: string; url?: string; state?: string; created?: number; meta?: unknown }) => ({
      id: d.uid,
      url: d.url,
      state: d.state,
      created: d.created,
      meta: d.meta,
    }));
    return {
      success: true,
      data: { deployments: list },
      source: "vercel_history",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: "vercel_history",
    };
  }
}

export const vercelLogsTool = {
  name: "get_deployment_logs",
  description: "Fetch build and runtime logs for a Vercel deployment",
  run: getDeploymentLogs,
};

export const vercelHistoryTool = {
  name: "get_deployment_history",
  description: "Fetch recent deployment history for the Vercel project",
  run: getDeploymentHistory,
};
