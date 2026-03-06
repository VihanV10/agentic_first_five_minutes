import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";
import { getDeploymentLogs } from "@/lib/tools/vercel";
import { getBedrockOneLineSummary } from "@/lib/agent";

export async function GET(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials. Configure settings first." },
      { status: 400 }
    );
  }
  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get("deploymentId")?.trim();
  if (!deploymentId) {
    return NextResponse.json(
      { error: "Missing deploymentId query parameter" },
      { status: 400 }
    );
  }
  const fullConfig = {
    ...config,
    pollingIntervalSeconds: config.pollingIntervalSeconds ?? 60,
  };
  try {
    const logsResult = await getDeploymentLogs(fullConfig, {
      deploymentId,
      timestamp: Date.now(),
    });
    const context =
      logsResult.success && logsResult.data != null
        ? JSON.stringify(logsResult.data).slice(0, 2000)
        : logsResult.error ?? "No log data";
    const summary = await getBedrockOneLineSummary(context);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      {
        summary:
          err instanceof Error ? err.message : "Could not summarize build.",
      },
      { status: 200 }
    );
  }
}
