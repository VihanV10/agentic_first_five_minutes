/**
 * Credentials and options from settings (localStorage). Passed to API via headers.
 */
export type UserConfig = {
  vercelToken: string;
  vercelProjectId: string;
  vercelTeamId?: string;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  pollingIntervalSeconds: number;
};

export type ToolContext = {
  deploymentId?: string;
  timestamp?: number;
};

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  source: string;
};

export type MCPTool = {
  name: string;
  description: string;
  run: (config: UserConfig, context?: ToolContext) => Promise<ToolResult>;
};

export type Hypothesis = {
  cause: string;
  confidence: number;
  suggestedFix: string;
};

export type InvestigationReport = {
  id: string;
  crashTimestamp: number;
  deploymentId: string;
  status: "crash" | "investigating";
  hypotheses: Hypothesis[];
  evidence: Record<string, ToolResult>;
  createdAt: string;
};

/** Header names used to pass credentials from frontend to API routes */
export const CREDENTIAL_HEADERS = {
  vercelToken: "x-vercel-token",
  vercelProjectId: "x-vercel-project-id",
  vercelTeamId: "x-vercel-team-id",
  githubToken: "x-github-token",
  githubOwner: "x-github-owner",
  githubRepo: "x-github-repo",
  supabaseUrl: "x-supabase-url",
  supabaseServiceRoleKey: "x-supabase-service-role-key",
  pollingInterval: "x-polling-interval",
} as const;

/** Build UserConfig from request headers */
export function configFromHeaders(headers: Headers): Partial<UserConfig> | null {
  const get = (k: string) => headers.get(k)?.trim() || undefined;
  const vercelToken = get(CREDENTIAL_HEADERS.vercelToken);
  const vercelProjectId = get(CREDENTIAL_HEADERS.vercelProjectId);
  const githubToken = get(CREDENTIAL_HEADERS.githubToken);
  const githubOwner = get(CREDENTIAL_HEADERS.githubOwner);
  const githubRepo = get(CREDENTIAL_HEADERS.githubRepo);
  const supabaseUrl = get(CREDENTIAL_HEADERS.supabaseUrl);
  const supabaseServiceRoleKey = get(CREDENTIAL_HEADERS.supabaseServiceRoleKey);
  if (!vercelToken || !vercelProjectId) return null;
  const pollingIntervalRaw = get(CREDENTIAL_HEADERS.pollingInterval);
  const pollingIntervalSeconds = pollingIntervalRaw
    ? Math.max(10, Math.min(3600, parseInt(pollingIntervalRaw, 10)) || 60)
    : 60;
  return {
    vercelToken,
    vercelProjectId,
    vercelTeamId: get(CREDENTIAL_HEADERS.vercelTeamId),
    githubToken: githubToken || undefined,
    githubOwner: githubOwner || undefined,
    githubRepo: githubRepo || undefined,
    supabaseUrl: supabaseUrl || undefined,
    supabaseServiceRoleKey: supabaseServiceRoleKey || undefined,
    pollingIntervalSeconds,
  };
}

/** Assert config has required Vercel fields (only Vercel is required) */
export function assertUserConfig(
  c: Partial<UserConfig> | null
): c is UserConfig {
  return (
    c != null &&
    typeof c.vercelToken === "string" &&
    c.vercelToken.length > 0 &&
    typeof c.vercelProjectId === "string" &&
    c.vercelProjectId.length > 0
  );
}
