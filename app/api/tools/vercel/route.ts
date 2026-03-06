import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";
import { getDeploymentLogs, getDeploymentHistory } from "@/lib/tools/vercel";

export async function POST(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials" },
      { status: 400 }
    );
  }
  let body: { deploymentId?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {}
  const context = body.deploymentId
    ? { deploymentId: body.deploymentId, timestamp: Date.now() }
    : undefined;
  const [logs, history] = await Promise.all([
    getDeploymentLogs(config, context),
    getDeploymentHistory(config, context),
  ]);
  return NextResponse.json({ vercel_logs: logs, vercel_history: history });
}
