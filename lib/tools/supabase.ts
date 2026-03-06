import { createClient } from "@supabase/supabase-js";
import type { UserConfig, ToolContext, ToolResult } from "@/lib/types";

/** Check DB connection; Supabase REST does not expose arbitrary SQL, so we probe with a non-existent table to verify URL + key. */
export async function getDbErrors(
  config: UserConfig,
  context?: ToolContext
): Promise<ToolResult> {
  void context;
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return {
      success: false,
      error: "Not configured",
      source: "supabase_errors",
    };
  }
  try {
    const supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey
    );
    const { error } = await supabase
      .from("_incident_copilot_health_check" as never)
      .select("1")
      .limit(1)
      .maybeSingle();
    if (error) {
      if (
        error.code === "PGRST116" ||
        error.message?.includes("does not exist") ||
        error.message?.toLowerCase().includes("relation")
      ) {
        return {
          success: true,
          data: {
            connection: "ok",
            note: "Project URL and service role valid; DB reachable.",
            errorCode: error.code,
          },
          source: "supabase_errors",
        };
      }
      return {
        success: false,
        error: error.message,
        data: { code: error.code },
        source: "supabase_errors",
      };
    }
    return {
      success: true,
      data: { connection: "ok", note: "Service role and URL valid." },
      source: "supabase_errors",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: "supabase_errors",
    };
  }
}

export const supabaseErrorsTool = {
  name: "get_db_errors",
  description: "Check Supabase project connection and return any available DB diagnostic info",
  run: getDbErrors,
};
