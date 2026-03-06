import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  UserConfig,
  ToolContext,
  ToolResult,
  Hypothesis,
} from "@/lib/types";
import { getDeploymentLogs, getDeploymentHistory } from "@/lib/tools/vercel";
import { getRecentCommits } from "@/lib/tools/github";
import { getDbErrors } from "@/lib/tools/supabase";

export type EvidenceMap = Record<string, ToolResult>;

export type AgentResult = {
  hypotheses: Hypothesis[];
  evidence: EvidenceMap;
};

const DEFAULT_MODEL_ID = "meta.llama3-8b-instruct-v1:0";

function summarizeResult(r: ToolResult): string {
  if (!r.success) return `[${r.source}] Error: ${r.error ?? "unknown"}`;
  try {
    return `[${r.source}] ${JSON.stringify(r.data)}`;
  } catch {
    return `[${r.source}] (non-JSON data)`;
  }
}

/** Build a single prompt string for Bedrock (deployment logs, commits, db health, crash time) */
function buildInvestigationPrompt(
  deploymentId: string,
  crashTimestamp: number | undefined,
  evidenceText: string
): string {
  const crashTime = crashTimestamp
    ? new Date(crashTimestamp).toISOString()
    : "unknown";
  return [
    "You are an incident response assistant. Given deployment failure evidence, output a single JSON object with a \"hypotheses\" array. Each hypothesis must have: \"cause\" (string), \"confidence\" (number 0.0-1.0), \"evidence\" (array of strings, optional), \"fix\" (string). Sort by confidence descending. Output only valid JSON, no markdown or explanation.",
    "",
    "---",
    "",
    "A Vercel deployment failed.",
    `Deployment ID: ${deploymentId}`,
    `Crash time: ${crashTime}`,
    "",
    "Evidence:",
    evidenceText,
    "",
    "Return JSON in this exact format: {\"hypotheses\": [{\"cause\": \"...\", \"confidence\": 0.0-1.0, \"evidence\": [\"...\"], \"fix\": \"...\"}]}",
  ].join("\n");
}

/** Llama 3 instruct format for Bedrock */
function formatLlamaPrompt(userPrompt: string): string {
  return [
    "<|begin_of_text|>",
    "<|start_header_id|>user<|end_header_id|>",
    "",
    userPrompt,
    "<|eot_id|>",
    "<|start_header_id|>assistant<|end_header_id|>",
    "",
  ].join("\n");
}

/** One-line summary from Bedrock (for last build description) */
export async function getBedrockOneLineSummary(context: string): Promise<string> {
  const userPrompt = `Based on this build/deployment info, reply with exactly one short sentence describing the build. Only output that sentence, nothing else.\n\n${context}`;
  const prompt = formatLlamaPrompt(userPrompt);
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;
  const client = createBedrockClient();
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(
      JSON.stringify({
        prompt,
        max_gen_len: 120,
        temperature: 0.2,
        top_p: 0.9,
      })
    ),
  });
  const response = await client.send(command);
  if (!response.body) return "Build status unknown.";
  const bodyJson = JSON.parse(
    new TextDecoder().decode(response.body)
  ) as { generation?: string };
  const text = (bodyJson.generation ?? "").trim();
  return text || "Build status unknown.";
}

function createBedrockClient(): BedrockRuntimeClient {
  const region = process.env.AWS_REGION ?? "us-east-1";
  return new BedrockRuntimeClient({
    region,
    ...(process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY && {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }),
  });
}

/** Parse Bedrock response and map to Hypothesis[] (handles both 0-1 and 0-100 confidence) */
function parseBedrockHypotheses(rawContent: string): Hypothesis[] {
  const cleaned = rawContent
    .replace(/^[\s\S]*?\{/, "{")
    .replace(/\}[\s\S]*$/, "}");
  const parsed = JSON.parse(cleaned) as unknown;
  const root =
    parsed != null && typeof parsed === "object" && "hypotheses" in parsed
      ? (parsed as { hypotheses?: unknown[] })
      : Array.isArray(parsed)
        ? { hypotheses: parsed }
        : null;
  if (!root || !Array.isArray(root.hypotheses)) return [];
  return root.hypotheses
    .filter(
      (
        p
      ): p is {
        cause?: string;
        confidence?: number;
        evidence?: string[];
        fix?: string;
      } => p != null && typeof p === "object"
    )
    .map((p) => {
      let confidence = typeof p.confidence === "number" ? p.confidence : 0;
      if (confidence <= 1) confidence = Math.round(confidence * 100);
      confidence = Math.min(100, Math.max(0, confidence));
      const suggestedFix =
        typeof p.fix === "string"
          ? p.fix
          : Array.isArray(p.evidence) && p.evidence.length > 0
            ? p.evidence.join(" ")
            : "";
      return {
        cause: typeof p.cause === "string" ? p.cause : "Unknown",
        confidence,
        suggestedFix,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

export async function runInvestigation(
  config: UserConfig,
  deploymentId: string,
  crashTimestamp?: number
): Promise<AgentResult> {
  const context: ToolContext = {
    deploymentId,
    timestamp: crashTimestamp ?? Date.now(),
  };

  const hasGitHub =
    !!config.githubToken && !!config.githubOwner && !!config.githubRepo;
  const hasSupabase =
    !!config.supabaseUrl && !!config.supabaseServiceRoleKey;

  const [vercelLogs, vercelHistory, githubCommits, supabaseErrors] =
    await Promise.all([
      getDeploymentLogs(config, context),
      getDeploymentHistory(config, context),
      hasGitHub
        ? getRecentCommits(config, context)
        : Promise.resolve({
            success: false,
            error: "Not configured",
            source: "github_commits",
          } as ToolResult),
      hasSupabase
        ? getDbErrors(config, context)
        : Promise.resolve({
            success: false,
            error: "Not configured",
            source: "supabase_errors",
          } as ToolResult),
    ]);

  const evidence: EvidenceMap = {
    vercel_logs: vercelLogs,
    vercel_history: vercelHistory,
    github_commits: githubCommits,
    supabase_errors: supabaseErrors,
  };

  const evidenceText = Object.entries(evidence)
    .map(([k, v]) => `${k}:\n${summarizeResult(v)}`)
    .join("\n\n");

  const userPrompt = buildInvestigationPrompt(
    deploymentId,
    crashTimestamp,
    evidenceText
  );
  const prompt = formatLlamaPrompt(userPrompt);

  const modelId =
    process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;

  let rawContent: string;
  try {
    const client = createBedrockClient();
    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(
        JSON.stringify({
          prompt,
          max_gen_len: 600,
          temperature: 0.2,
          top_p: 0.9,
        })
      ),
    });
    const response = await client.send(command);
    if (!response.body) throw new Error("Empty Bedrock response body");
    const bodyJson = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as { generation?: string };
    rawContent = bodyJson.generation ?? "{}";
  } catch (err) {
    return {
      hypotheses: [
        {
          cause: "Investigation failed",
          confidence: 100,
          suggestedFix:
            err instanceof Error ? err.message : String(err),
        },
      ],
      evidence: {
        ...evidence,
        _bedrock_error: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          source: "bedrock",
        },
      },
    };
  }

  let hypotheses: Hypothesis[] = [];
  try {
    hypotheses = parseBedrockHypotheses(rawContent);
    if (hypotheses.length === 0) {
      hypotheses = [
        {
          cause: "No hypotheses could be extracted",
          confidence: 100,
          suggestedFix: "Raw output: " + rawContent.slice(0, 300),
        },
      ];
    }
  } catch {
    hypotheses = [
      {
        cause: "Analysis failed",
        confidence: 100,
        suggestedFix:
          "Could not parse model response as JSON. Raw: " +
          rawContent.slice(0, 200),
      },
    ];
  }

  return { hypotheses, evidence };
}
