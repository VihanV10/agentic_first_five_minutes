import { NextResponse } from "next/server";
import { CREDENTIAL_HEADERS } from "@/lib/types";
import { getDeploymentHistory } from "@/lib/tools/vercel";
import { getDbErrors } from "@/lib/tools/supabase";

export async function GET(request: Request) {
  const headers = request.headers;

  let vercel = false;
  const vercelToken = headers.get(CREDENTIAL_HEADERS.vercelToken)?.trim();
  const vercelProjectId = headers.get(CREDENTIAL_HEADERS.vercelProjectId)?.trim();
  const vercelTeamId = headers.get(CREDENTIAL_HEADERS.vercelTeamId)?.trim();
  if (vercelToken && vercelProjectId) {
    try {
      const res = await getDeploymentHistory(
        {
          vercelToken,
          vercelProjectId,
          vercelTeamId: vercelTeamId || undefined,
          githubToken: "",
          githubOwner: "",
          githubRepo: "",
          supabaseUrl: "",
          supabaseServiceRoleKey: "",
          pollingIntervalSeconds: 60,
        },
        undefined
      );
      vercel = res.success;
    } catch {
      vercel = false;
    }
  }

  let github = false;
  const githubToken = headers.get(CREDENTIAL_HEADERS.githubToken)?.trim();
  const githubOwner = headers.get(CREDENTIAL_HEADERS.githubOwner)?.trim();
  const githubRepo = headers.get(CREDENTIAL_HEADERS.githubRepo)?.trim();
  if (githubToken && githubOwner && githubRepo) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      github = res.ok;
    } catch {
      github = false;
    }
  }

  let supabase = false;
  const supabaseUrl = headers.get(CREDENTIAL_HEADERS.supabaseUrl)?.trim();
  const supabaseServiceRoleKey = headers
    .get(CREDENTIAL_HEADERS.supabaseServiceRoleKey)
    ?.trim();
  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      const res = await getDbErrors(
        {
          vercelToken: "",
          vercelProjectId: "",
          githubToken: "",
          githubOwner: "",
          githubRepo: "",
          supabaseUrl,
          supabaseServiceRoleKey,
          pollingIntervalSeconds: 60,
        },
        undefined
      );
      supabase = res.success;
    } catch {
      supabase = false;
    }
  }

  return NextResponse.json({ vercel, github, supabase });
}
