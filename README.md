# The First Five Minutes

**Agentic, MCP-aligned incident triage for failed Vercel deployments.** The model does not guess in a vacuum: it **chooses tools**, reads real signals from your stack, and only then ranks causes and fixes.

---

## The problem

When a deploy goes red, engineering time is burned in two places.

**1. Context tax.** Someone opens Vercel logs, scrolls build output, checks whether the last merge changed dependencies, maybe peeks at Supabase or the database. None of that is “fixing” yet. It is **reconstructing reality** from disconnected dashboards. In many teams the **first 30–60 minutes** are mostly navigation and correlation, not code changes.

**2. Single-shot “AI” does not help enough.** A typical pattern is: fetch everything in parallel, stuff it into one prompt, ask the model once. That is fast, but the model **cannot adapt**. It cannot decide “logs are noisy, widen deployment history” or “error is clearly build-time, skip DB checks.” You pay for tokens on data the model never needed, and you still miss the right slice of evidence.

This project targets the **first five minutes of that funnel**: automated triage that behaves more like a careful on-call engineer—**observe, act, observe again**—until it can justify a ranked report.

---

## What we built

A small **Next.js dashboard** watches your project’s deployments. On success you get a short AI summary of the build. On failure it triggers an **investigation**: a **bounded multi-turn loop** where **AWS Bedrock (Llama 3-class instruct)** either requests **tool calls** or returns a **final** structured verdict (hypotheses, confidence, suggested fixes).

Evidence and **ordered agent steps** (which tools ran, whether they succeeded) surface in the UI so you can trust the path, not only the conclusion.

Credentials for Vercel (and optional GitHub / Supabase) live in the **browser** and are sent as **HTTP headers** to your API routes. The server does **not** persist them.

---

## MCP: why it matters here

[**Model Context Protocol (MCP)**](https://modelcontextprotocol.io/) is an open way to expose **tools** to AI clients: each tool has a **name**, **human-readable description**, and **JSON Schema** for arguments. Hosts (IDEs, assistants, or your own backend) call `tools/list` and `tools/call` over a transport (commonly **stdio** for local processes).

This codebase does **not** only bolt on MCP as an afterthought. Tools are defined **once** in [`lib/tool-registry.ts`](lib/tool-registry.ts) in that **MCP-shaped** form. That gives you:

| Layer | Role |
|--------|------|
| **Tool registry** | Single source of truth: schemas + executors (Vercel logs/history, GitHub commits, Supabase probe). |
| **Web investigation agent** | Bedrock reads the same catalog, emits JSON `tool_calls` or `final`, server runs tools and appends results to the transcript—**same contracts** as MCP. |
| **Optional stdio MCP server** | [`scripts/mcp-server.ts`](scripts/mcp-server.ts) exposes those tools to **Cursor** (or any MCP host) via env-based config, without duplicating integration logic. |

So: **MCP is the contract; the agent is the reasoning loop that uses that contract.** The web app and the MCP server are two **hosts** for the same tool surface.

---

## Agent: how the loop actually works

A **true** agent loop is more than “call an API with a big prompt.” Here the server repeats until one of these happens:

1. The model returns **`{"final":{"hypotheses":[...]}}`** (ranked causes, confidence, fixes).  
2. The model returns **`{"tool_calls":[{"name","arguments"}, ...]}`** → the server executes each via the registry, **appends truncated tool output** to the transcript, and **invokes the model again**.  
3. A configurable **step cap** is hit (`AGENT_MAX_STEPS`, default 10, max 20). Then a **synthesis** pass runs: all collected evidence is sent in one prompt so you still get hypotheses instead of an abrupt stop.

The model uses **JSON-only** tool protocol (works well with Llama 3 instruct on Bedrock). If you later move to a model with native tool APIs (for example Bedrock Converse with tool config), you can swap the **transport** around the same registry.

**Why this is “deeper” than batch-and-pray:** the model can **sequence** evidence (logs first, then history, then commits), **stop early** when signal is clear, and **avoid** optional integrations when they are irrelevant—within the step and payload limits you set for serverless safety.

---

## User flow

```
Settings (credentials) → Dashboard → Poll Vercel every N seconds
    → Latest deployment card + optional AI one-liner
    → If state = ERROR → POST /api/investigate → Report (hypotheses + agent steps + raw evidence)
```

---

## Data flow (compact)

```
Browser                          Next.js API
   │                                    │
   ├─ GET /api/poll ───────────────────► Vercel: list deployments
   ├─ GET /api/summarize-build ────────► Vercel logs + Bedrock (one line)
   └─ POST /api/investigate ───────────► Agent loop:
                                         Bedrock ↔ tool registry
                                         (vercel logs/history, github, supabase)
                                         → hypotheses + evidence + agentSteps
```

---

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind  
- **AWS Bedrock** — investigation loop + build summary  
- **Integrations** — Vercel API (required for core flow), GitHub & Supabase optional  
- **@modelcontextprotocol/sdk** — stdio MCP server in `scripts/`

---

## Prerequisites

- **Vercel:** API token, project ID, optional team ID — [vercel.com](https://vercel.com)  
- **AWS:** IAM user with `bedrock:InvokeModel` (and keys in `.env`)  
- **Optional:** GitHub token + `owner/repo`; Supabase URL + service role key  

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/VihanV10/agentic_first_five_minutes.git
cd agentic_first_five_minutes
npm install
```

### 2. Environment (Bedrock)

```bash
cp .env.example .env
```

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
BEDROCK_MODEL_ID=meta.llama3-8b-instruct-v1:0

# Optional: tool rounds per investigation (default 10, max 20)
# AGENT_MAX_STEPS=10
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), complete **Settings**, then use the dashboard.

---

## Project layout

| Path | Purpose |
|------|---------|
| [`app/page.tsx`](app/page.tsx) | Dashboard: polling, builds, reports |
| [`app/settings/page.tsx`](app/settings/page.tsx) | Credentials |
| [`app/api/investigate/route.ts`](app/api/investigate/route.ts) | Runs `runInvestigation`, returns report + `agentSteps` |
| [`lib/tool-registry.ts`](lib/tool-registry.ts) | MCP-shaped tool definitions and `executeRegisteredTool` |
| [`lib/agent.ts`](lib/agent.ts) | Bedrock agent loop (`tool_calls` / `final`) + synthesis fallback |
| [`lib/tools/`](lib/tools/) | Raw API helpers (Vercel, GitHub, Supabase) |
| [`scripts/mcp-server.ts`](scripts/mcp-server.ts) | Stdio MCP server for Cursor / other MCP clients |

---

## MCP server (Cursor and other hosts)

For **IDE-native** agents, run the same tools over MCP. Configure **environment variables** (not browser localStorage):

- Required for most tools: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`  
- Optional: `VERCEL_TEAM_ID`, `GITHUB_*`, `SUPABASE_*`  
- For log tool defaults: `MCP_DEFAULT_DEPLOYMENT_ID`, `MCP_DEFAULT_CRASH_TIMESTAMP_MS`  
- `get_deployment_logs` also accepts `deployment_id` in the tool **arguments**

From the repo root:

```bash
npm run mcp:server
```

**Cursor** (`mcp.json` example — set `cwd` to your machine’s path):

```json
{
  "mcpServers": {
    "first-five-minutes": {
      "command": "npx",
      "args": ["tsx", "--tsconfig", "tsconfig.json", "scripts/mcp-server.ts"],
      "cwd": "/absolute/path/to/agentic_first_five_minutes",
      "env": {
        "VERCEL_TOKEN": "...",
        "VERCEL_PROJECT_ID": "..."
      }
    }
  }
}
```

---

## Roadmap (ideas)

- MCP over **HTTP/SSE** for remote or hosted clients  
- More signal sources (Sentry, Datadog, Axiom, …) as additional registry tools  
- Deploy targets beyond Vercel  
- Alerts (Slack, webhooks) and durable report storage outside `localStorage`  
