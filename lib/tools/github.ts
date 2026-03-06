import type { UserConfig, ToolContext, ToolResult } from "@/lib/types";

const GITHUB_API = "https://api.github.com";

/** Get recent commits around crash time (since = crash - 1 hour) */
export async function getRecentCommits(
  config: UserConfig,
  context?: ToolContext
): Promise<ToolResult> {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
    return {
      success: false,
      error: "Not configured",
      source: "github_commits",
    };
  }
  try {
    const since = context?.timestamp
      ? new Date(context.timestamp - 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const path = `/repos/${config.githubOwner}/${config.githubRepo}/commits?since=${encodeURIComponent(since)}&per_page=20`;
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `GitHub API ${res.status}: ${text.slice(0, 500)}`,
        source: "github_commits",
      };
    }
    const commits = await res.json();
    const list = (Array.isArray(commits) ? commits : []).map(
      (c: {
        sha?: string;
        commit?: { message?: string; author?: { date?: string; name?: string } };
        author?: { login?: string };
      }) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split("\n")[0],
        date: c.commit?.author?.date,
        author: c.commit?.author?.name ?? c.author?.login,
      })
    );
    return {
      success: true,
      data: { commits: list, since },
      source: "github_commits",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: "github_commits",
    };
  }
}

export const githubCommitsTool = {
  name: "get_recent_commits",
  description: "Fetch recent Git commits for the repo around the crash time",
  run: getRecentCommits,
};
