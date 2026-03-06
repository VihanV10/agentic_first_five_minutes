import { NextResponse } from "next/server";
import { configFromHeaders, assertUserConfig } from "@/lib/types";
import { getDbErrors } from "@/lib/tools/supabase";

export async function POST(request: Request) {
  const config = configFromHeaders(request.headers);
  if (!assertUserConfig(config)) {
    return NextResponse.json(
      { error: "Missing credentials" },
      { status: 400 }
    );
  }
  const result = await getDbErrors(config, undefined);
  return NextResponse.json(result);
}
