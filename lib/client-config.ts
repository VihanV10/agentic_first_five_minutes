import { CREDENTIAL_HEADERS } from "@/lib/types";
import type { UserConfig } from "@/lib/types";

const STORAGE_KEY = "incident-copilot-settings";
const CONFIGURED_KEY = "incident-copilot-configured";

export function getStoredConfig(): Partial<UserConfig> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pollingIntervalSeconds =
      typeof parsed.pollingIntervalSeconds === "number"
        ? parsed.pollingIntervalSeconds
        : 60;
    return {
      vercelToken: typeof parsed.vercelToken === "string" ? parsed.vercelToken : "",
      vercelProjectId: typeof parsed.vercelProjectId === "string" ? parsed.vercelProjectId : "",
      vercelTeamId: typeof parsed.vercelTeamId === "string" ? parsed.vercelTeamId : undefined,
      githubToken: typeof parsed.githubToken === "string" ? parsed.githubToken : "",
      githubOwner: typeof parsed.githubOwner === "string" ? parsed.githubOwner : "",
      githubRepo: typeof parsed.githubRepo === "string" ? parsed.githubRepo : "",
      supabaseUrl: typeof parsed.supabaseUrl === "string" ? parsed.supabaseUrl : "",
      supabaseServiceRoleKey:
        typeof parsed.supabaseServiceRoleKey === "string"
          ? parsed.supabaseServiceRoleKey
          : "",
      pollingIntervalSeconds: Math.max(10, Math.min(3600, pollingIntervalSeconds)),
    };
  } catch {
    return null;
  }
}

export function setStoredConfig(config: Partial<UserConfig>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  localStorage.setItem(CONFIGURED_KEY, "1");
}

export function isConfigured(): boolean {
  if (typeof window === "undefined") return false;
  const key = localStorage.getItem(CONFIGURED_KEY);
  const config = getStoredConfig();
  return key === "1" && config != null && !!config.vercelToken && !!config.vercelProjectId;
}

/** Build headers object for API calls from localStorage config */
export function getCredentialsHeaders(): Record<string, string> {
  const c = getStoredConfig();
  if (!c) return {};
  const h: Record<string, string> = {};
  if (c.vercelToken) h[CREDENTIAL_HEADERS.vercelToken] = c.vercelToken;
  if (c.vercelProjectId) h[CREDENTIAL_HEADERS.vercelProjectId] = c.vercelProjectId;
  if (c.vercelTeamId) h[CREDENTIAL_HEADERS.vercelTeamId] = c.vercelTeamId;
  if (c.githubToken) h[CREDENTIAL_HEADERS.githubToken] = c.githubToken;
  if (c.githubOwner) h[CREDENTIAL_HEADERS.githubOwner] = c.githubOwner;
  if (c.githubRepo) h[CREDENTIAL_HEADERS.githubRepo] = c.githubRepo;
  if (c.supabaseUrl) h[CREDENTIAL_HEADERS.supabaseUrl] = c.supabaseUrl;
  if (c.supabaseServiceRoleKey)
    h[CREDENTIAL_HEADERS.supabaseServiceRoleKey] = c.supabaseServiceRoleKey;
  if (c.pollingIntervalSeconds != null)
    h[CREDENTIAL_HEADERS.pollingInterval] = String(c.pollingIntervalSeconds);
  return h;
}
