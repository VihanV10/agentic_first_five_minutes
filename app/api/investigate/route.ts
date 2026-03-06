import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";
import { runInvestigation } from "@/lib/agent";
import type { InvestigationReport } from "@/lib/types";

export async function POST(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials. Configure settings first." },
      { status: 400 }
    );
  }
  let body: { deploymentId?: string; crashTimestamp?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const deploymentId = body.deploymentId ?? "";
  if (!deploymentId) {
    return NextResponse.json(
      { error: "Missing deploymentId in body" },
      { status: 400 }
    );
  }
  const crashTimestamp = body.crashTimestamp ?? Date.now();

  const { hypotheses, evidence } = await runInvestigation(
    config,
    deploymentId,
    crashTimestamp
  );

  const report: InvestigationReport = {
    id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    crashTimestamp,
    deploymentId,
    status: "crash",
    hypotheses,
    evidence,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(report);
}
