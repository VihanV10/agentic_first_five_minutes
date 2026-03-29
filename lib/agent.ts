import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  UserConfig,
  ToolContext,
  ToolResult,
  Hypothesis,
  AgentInvestigationStep,
} from "@/lib/types";
import {
  listToolDefinitionsForConfig,
  executeRegisteredTool,
} from "@/lib/tool-registry";

export type EvidenceMap = Record<string, ToolResult>;

export type AgentResult = {
  hypotheses: Hypothesis[];
  evidence: EvidenceMap;
  agentSteps: AgentInvestigationStep[];
};

const DEFAULT_MODEL_ID = "meta.llama3-8b-instruct-v1:0";
const DEFAULT_MAX_AGENT_STEPS = 10;
const MAX_TOOL_RESULT_CHARS = 3500;
const MAX_TRANSCRIPT_ASSISTANT_CHARS = 2500;

function getMaxAgentSteps(): number {
  const raw = process.env.AGENT_MAX_STEPS;
  if (!raw) return DEFAULT_MAX_AGENT_STEPS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_AGENT_STEPS;
  return Math.max(1, Math.min(20, n));
}

function summarizeResult(r: ToolResult): string {
  if (!r.success) return `[${r.source}] Error: ${r.error ?? "unknown"}`;
  try {
    return `[${r.source}] ${JSON.stringify(r.data)}`;
  } catch {
    return `[${r.source}] (non-JSON data)`;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…(truncated)";
}

/** Extract first top-level JSON object from model output */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1)) as unknown;
      }
    }
  }
  throw new Error("Unbalanced JSON braces");
}

function normalizeHypothesesArray(hypotheses: unknown[]): Hypothesis[] {
  return hypotheses
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

/** Parse hypotheses from agent final payload or legacy Bedrock string */
function parseHypothesesFromUnknown(parsed: unknown): Hypothesis[] | null {
  if (parsed == null || typeof parsed !== "object") return null;
  const root = parsed as {
    final?: { hypotheses?: unknown[] };
    hypotheses?: unknown[];
  };
  const arr = root.final?.hypotheses ?? root.hypotheses;
  if (!Array.isArray(arr)) return null;
  return normalizeHypothesesArray(arr);
}

/** Parse Bedrock response string and map to Hypothesis[] (handles both 0-1 and 0-100 confidence) */
function parseBedrockHypotheses(rawContent: string): Hypothesis[] {
  const cleaned = rawContent
    .replace(/^[\s\S]*?\{/, "{")
    .replace(/\}[\s\S]*$/, "}");
  const parsed = JSON.parse(cleaned) as unknown;
  const fromObj = parseHypothesesFromUnknown(parsed);
  if (fromObj && fromObj.length > 0) return fromObj;
  return [];
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

async function invokeBedrock(
  userPrompt: string,
  maxGenLen: number
): Promise<string> {
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;
  const client = createBedrockClient();
  const prompt = formatLlamaPrompt(userPrompt);
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(
      JSON.stringify({
        prompt,
        max_gen_len: maxGenLen,
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
  return (bodyJson.generation ?? "").trim();
}

function buildToolsCatalogJson(config: UserConfig): string {
  const defs = listToolDefinitionsForConfig(config);
  return JSON.stringify(defs, null, 2);
}

function buildInitialAgentPrompt(
  config: UserConfig,
  deploymentId: string,
  crashTimestamp: number | undefined
): string {
  const crashTime = crashTimestamp
    ? new Date(crashTimestamp).toISOString()
    : "unknown";
  const catalog = buildToolsCatalogJson(config);
  return [
    "You are an incident response assistant. A Vercel deployment failed.",
    "",
    `Deployment ID: ${deploymentId}`,
    `Crash time: ${crashTime}`,
    "",
    "Gather evidence using tools when needed, then output ranked root-cause hypotheses.",
    "",
    "Available tools (name, description, inputSchema):",
    catalog,
    "",
    "PROTOCOL: Reply with a single JSON object only. No markdown fences, no explanation outside JSON.",
    "",
    'To fetch evidence: {"tool_calls":[{"name":"<tool_name>","arguments":{}}]}',
    "You may include multiple tools in tool_calls. Only use tool names from the catalog.",
    "",
    'When ready to conclude: {"final":{"hypotheses":[{"cause":"string","confidence":0.0,"evidence":["optional strings"],"fix":"string"}]}}',
    "confidence may be 0.0-1.0 or 0-100. Sort hypotheses by confidence descending in your reasoning.",
    "",
    "Prefer calling tools first if you lack log or commit data. When evidence is sufficient, respond with final.",
  ].join("\n");
}

function buildSynthesisPrompt(
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

type ParsedTurn =
  | { kind: "tool_calls"; calls: { name: string; arguments: Record<string, unknown> }[] }
  | { kind: "final"; hypotheses: Hypothesis[] }
  | { kind: "invalid" };

function parseAgentTurn(parsed: unknown): ParsedTurn {
  if (parsed == null || typeof parsed !== "object") return { kind: "invalid" };
  const o = parsed as {
    tool_calls?: unknown;
    final?: unknown;
    hypotheses?: unknown[];
  };

  const hyDirect = parseHypothesesFromUnknown(parsed);
  if (hyDirect && hyDirect.length > 0 && !o.tool_calls) {
    return { kind: "final", hypotheses: hyDirect };
  }

  if (Array.isArray(o.tool_calls) && o.tool_calls.length > 0) {
    const calls: { name: string; arguments: Record<string, unknown> }[] = [];
    for (const c of o.tool_calls) {
      if (c == null || typeof c !== "object") continue;
      const tc = c as { name?: unknown; arguments?: unknown };
      if (typeof tc.name !== "string" || !tc.name.trim()) continue;
      const args =
        tc.arguments != null &&
        typeof tc.arguments === "object" &&
        !Array.isArray(tc.arguments)
          ? (tc.arguments as Record<string, unknown>)
          : {};
      calls.push({ name: tc.name.trim(), arguments: args });
    }
    if (calls.length > 0) return { kind: "tool_calls", calls };
  }

  const hy = parseHypothesesFromUnknown(parsed);
  if (hy && hy.length > 0) return { kind: "final", hypotheses: hy };

  return { kind: "invalid" };
}

function emptyHypothesisMessage(raw: string): Hypothesis[] {
  return [
    {
      cause: "No hypotheses could be extracted",
      confidence: 100,
      suggestedFix: "Raw output: " + truncate(raw, 300),
    },
  ];
}

/** One-line summary from Bedrock (for last build description) */
export async function getBedrockOneLineSummary(context: string): Promise<string> {
  const userPrompt = `Based on this build/deployment info, reply with exactly one short sentence describing the build. Only output that sentence, nothing else.\n\n${context}`;
  try {
    const text = await invokeBedrock(userPrompt, 120);
    return text || "Build status unknown.";
  } catch {
    return "Build status unknown.";
  }
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

  const evidence: EvidenceMap = {};
  const agentSteps: AgentInvestigationStep[] = [];
  const maxSteps = getMaxAgentSteps();

  let transcript = buildInitialAgentPrompt(config, deploymentId, crashTimestamp);

  const pushBedrockError = (err: unknown) => {
    evidence._bedrock_error = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: "bedrock",
    };
  };

  try {
    for (let step = 0; step < maxSteps; step++) {
      let raw: string;
      try {
        raw = await invokeBedrock(transcript, 900);
      } catch (err) {
        pushBedrockError(err);
        return {
          hypotheses: [
            {
              cause: "Investigation failed",
              confidence: 100,
              suggestedFix:
                err instanceof Error ? err.message : String(err),
            },
          ],
          evidence,
          agentSteps,
        };
      }

      let parsed: unknown;
      try {
        parsed = extractJsonObject(raw);
      } catch {
        transcript += `\nAssistant: ${truncate(raw, MAX_TRANSCRIPT_ASSISTANT_CHARS)}\nUser: Your last message was not valid JSON. Reply with only one JSON object: either {"tool_calls":[{"name":"...","arguments":{}}]} or {"final":{"hypotheses":[...]}}.\n`;
        continue;
      }

      const turn = parseAgentTurn(parsed);

      if (turn.kind === "final") {
        return {
          hypotheses: turn.hypotheses,
          evidence,
          agentSteps,
        };
      }

      if (turn.kind === "tool_calls") {
        const batchResults: { name: string; output: string }[] = [];
        for (const call of turn.calls) {
          const result = await executeRegisteredTool(
            call.name,
            config,
            context,
            call.arguments
          );
          evidence[result.source] = result;
          agentSteps.push({
            tool: call.name,
            argsSummary: truncate(JSON.stringify(call.arguments), 160),
            ok: result.success,
          });
          batchResults.push({
            name: call.name,
            output: truncate(summarizeResult(result), MAX_TOOL_RESULT_CHARS),
          });
        }
        transcript += `\nAssistant: ${truncate(raw, MAX_TRANSCRIPT_ASSISTANT_CHARS)}\nUser: Tool results (JSON):\n${JSON.stringify(batchResults)}\n\nReply with the next JSON object only (more tool_calls or final).\n`;
        continue;
      }

      transcript += `\nAssistant: ${truncate(raw, MAX_TRANSCRIPT_ASSISTANT_CHARS)}\nUser: Invalid JSON shape. Use {"tool_calls":[{"name":"tool_name","arguments":{}}]} OR {"final":{"hypotheses":[{"cause","confidence","fix"}]}}.\n`;
    }

    // Max steps: synthesize from collected evidence
    const evidenceText = Object.keys(evidence).length
      ? Object.entries(evidence)
          .map(([k, v]) => `${k}:\n${summarizeResult(v)}`)
          .join("\n\n")
      : "No tool results were collected.";

    const synthPrompt = buildSynthesisPrompt(
      deploymentId,
      crashTimestamp,
      evidenceText
    );

    let rawContent: string;
    try {
      rawContent = await invokeBedrock(synthPrompt, 700);
    } catch (err) {
      pushBedrockError(err);
      return {
        hypotheses: [
          {
            cause: "Investigation failed (synthesis)",
            confidence: 100,
            suggestedFix:
              err instanceof Error ? err.message : String(err),
          },
        ],
        evidence,
        agentSteps,
      };
    }

    let hypotheses: Hypothesis[] = [];
    try {
      hypotheses = parseBedrockHypotheses(rawContent);
      if (hypotheses.length === 0) {
        hypotheses = emptyHypothesisMessage(rawContent);
      }
    } catch {
      hypotheses = [
        {
          cause: "Analysis failed",
          confidence: 100,
          suggestedFix:
            "Could not parse model response as JSON. Raw: " +
            truncate(rawContent, 200),
        },
      ];
    }

    return { hypotheses, evidence, agentSteps };
  } catch (err) {
    pushBedrockError(err);
    return {
      hypotheses: [
        {
          cause: "Investigation failed",
          confidence: 100,
          suggestedFix: err instanceof Error ? err.message : String(err),
        },
      ],
      evidence,
      agentSteps,
    };
  }
}
