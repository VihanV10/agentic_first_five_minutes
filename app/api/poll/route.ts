import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";

const VERCEL_API = "https://api.vercel.com";

export async function GET(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials. Configure settings first." },
      { status: 400 }
    );
  }
  try {
    const url = new URL("/v6/deployments", VERCEL_API);
    url.searchParams.set("projectId", config.vercelProjectId);
    url.searchParams.set("limit", "5");
    if (config.vercelTeamId) url.searchParams.set("teamId", config.vercelTeamId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.vercelToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          crashDetected: false,
          message: `Vercel API error: ${res.status} ${text.slice(0, 200)}`,
        },
        { status: 200 }
      );
    }
    const data = await res.json();
    const deployments = data.deployments ?? data ?? [];
    const latest = deployments[0];
    if (!latest) {
      return NextResponse.json({
        crashDetected: false,
        latestDeployment: null,
        message: "No deployments found",
      });
    }
    const state = (latest.state ?? "").toUpperCase();
    const crashDetected = state === "ERROR" || state === "CANCELED";
    const latestDeployment = {
      id: latest.uid ?? latest.id,
      url: latest.url,
      state: latest.state,
      created: latest.created,
    };
    return NextResponse.json({
      crashDetected,
      deployment: crashDetected ? latestDeployment : undefined,
      latestDeployment,
      message: crashDetected ? "Crash detected" : "All good",
    });
  } catch (err) {
    return NextResponse.json(
      {
        crashDetected: false,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }
}
