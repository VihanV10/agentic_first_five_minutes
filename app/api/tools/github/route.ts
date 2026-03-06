import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";
import { getRecentCommits } from "@/lib/tools/github";

export async function POST(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials" },
      { status: 400 }
    );
  }
  let body: { since?: number } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {}
  const context = body.since
    ? { timestamp: body.since }
    : { timestamp: Date.now() };
  const result = await getRecentCommits(config, context);
  return NextResponse.json(result);
}
