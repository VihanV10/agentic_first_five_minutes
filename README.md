# The First Five Minutes: Agentic Incident Investigation

When a deployment fails, the first thing an engineer does is **triage the incident**.  
They open logs, check recent commits, verify database connections, and try to figure out what changed.

In real production environments, **on-call engineers often spend the first 30–60 minutes just gathering context** before they can even start fixing the issue.

This project automates **those first five minutes of investigation**.

Incident Response Copilot is an **agentic debugging system** that detects failed Vercel deployments and immediately begins collecting evidence across your stack.

Instead of manually jumping between dashboards, the agent automatically gathers signals from:

- Vercel deployment logs  
- Vercel deployment history  
- GitHub commit history  
- Supabase database health  

It then sends that evidence to **AWS Bedrock (Meta Llama 3)**, which analyzes the signals and produces a **ranked report of likely causes and suggested fixes.**

---

## What It Does

You connect your project once through a simple settings form. After that, the system continuously monitors deployments.

When deployments succeed, the dashboard displays the latest build and a short AI-generated summary.

When a deployment fails, the agent automatically begins an investigation.

The system:

- **Polls Vercel periodically** to detect new deployments  
- **Identifies failed builds** in real time  
- **Collects debugging evidence** from logs, commits, and database signals  
- **Runs an AI investigation** using AWS Bedrock  
- **Generates a structured incident report** with ranked root-cause hypotheses and suggested fixes  

Each report includes:

- Deployment ID and timestamp  
- Ranked hypotheses with confidence scores  
- Suggested fixes  
- Collapsible raw evidence from each source, plus an **agent steps** list when the model used tools  

The goal is simple: **replace manual log digging with automated incident triage.**

Instead of spending the first hour figuring out *what happened*, engineers immediately see **a prioritized explanation of why the deployment likely failed.**
---

## How It Works

### User flow

```
First visit → Settings page (credentials form)
     ↓
Save (Vercel token + Project ID required; GitHub & Supabase optional)
     ↓
Redirect to Dashboard
     ↓
Polling starts immediately
     ↓
Last build card appears (deployment ID, state, AI one-liner)
     ↓
If latest deployment state = ERROR → "Investigating..." → Report card appears
```

### Data flow

```
Dashboard (client)
    │
    ├─► GET /api/poll (every N sec) ──► Vercel API (list deployments)
    │       │
    │       └─► Returns: crashDetected?, latestDeployment
    │
    ├─► GET /api/summarize-build?deploymentId=... ──► Vercel logs + Bedrock
    │       └─► Returns: one-line AI summary
    │
    └─► POST /api/investigate (when crash) ──► Agentic loop (Bedrock + tools):
            │
            ├─► Model chooses MCP-shaped tools (see lib/tool-registry.ts)
            │       get_deployment_logs, get_deployment_history,
            │       get_recent_commits (if GitHub configured),
            │       get_db_errors (if Supabase configured)
            │
            ├─► Tool results appended to transcript; repeat until final JSON
            │
            └─► Ranked hypotheses (+ agent step log on the report)
```

Credentials are stored in **localStorage** and sent in request headers on every API call. The server never stores them.

### What you see

- **Settings:** Single form — Vercel (token, project ID, team ID), GitHub (token, owner, repo), Supabase (URL, service key), polling interval. Only Vercel is required.
- **Dashboard:** Connection badges (Vercel / GitHub / Supabase), app status (All Good / Investigating… / Crash Detected), Last build card, Latest report (when a crash was investigated), Report history list.
- **Report card:** Crash timestamp, deployment ID, ranked causes with confidence % and suggested fix, optional ordered agent steps, collapsible raw evidence per source.

---

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- AWS Bedrock (Meta Llama 3) for investigation and build summary
- Optional: Vercel API, GitHub API, Supabase (only Vercel required)

---

## Prerequisites

- **Vercel:** API token, Project ID (and optional Team ID) from [vercel.com](https://vercel.com)
- **AWS:** Access key and secret for Bedrock (for investigation + build summary)
- **Optional:** GitHub token + repo owner/name; Supabase project URL + service role key

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/incident-response-copilot.git
cd incident-response-copilot
npm install
```

### 2. AWS (Bedrock)

Copy the example env file and set your AWS credentials and model:

```bash
cp .env.example .env
```

Edit `.env`:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
BEDROCK_MODEL_ID=meta.llama3-8b-instruct-v1:0

# Optional: cap multi-turn tool rounds per investigation (default 10, max 20)
# AGENT_MAX_STEPS=10
```

Create keys in AWS Console → IAM → Users → Security credentials → Create access key. The user needs `bedrock:InvokeModel` (e.g. `AmazonBedrockFullAccess` or a minimal policy).

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll land on **Settings**: enter at least Vercel token and Project ID, then save. You’re redirected to the dashboard; polling starts and the “Last build” card appears when there’s a deployment.

---

## Project layout

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Dashboard: polling, last build, reports |
| `app/settings/page.tsx` | Credentials form |
| `app/api/poll/route.ts` | Vercel status + latest deployment |
| `app/api/investigate/route.ts` | Run agent, return report |
| `app/api/summarize-build/route.ts` | One-line AI build summary |
| `app/api/status/route.ts` | Connection checks (Vercel/GitHub/Supabase) |
| `app/api/tools/*` | Proxies to Vercel/GitHub/Supabase tools |
| `lib/tool-registry.ts` | MCP-shaped tool definitions + dispatch |
| `lib/agent.ts` | Bedrock agent loop (tool_calls / final JSON) |
| `lib/tools/` | vercel, github, supabase API helpers |
| `scripts/mcp-server.ts` | Optional stdio MCP server for Cursor / other hosts |

---

## MCP server (Cursor / IDE)

The same tools are available over **stdio MCP** for local agents. Credentials come from the **shell environment** (not from the web app’s localStorage).

1. Set at least `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` (and optional `VERCEL_TEAM_ID`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. For `get_deployment_logs`, pass `deployment_id` in the tool arguments (or set `MCP_DEFAULT_DEPLOYMENT_ID`). Optional: `MCP_DEFAULT_CRASH_TIMESTAMP_MS` for commit window context.
3. Run from the repo root: `npm run mcp:server` (uses `tsx`).

Example **Cursor** `mcp.json` fragment:

```json
{
  "mcpServers": {
    "first-five-minutes": {
      "command": "npx",
      "args": ["tsx", "--tsconfig", "tsconfig.json", "scripts/mcp-server.ts"],
      "cwd": "/absolute/path/to/first_five_minutes_cursor",
      "env": {
        "VERCEL_TOKEN": "...",
        "VERCEL_PROJECT_ID": "..."
      }
    }
  }
}
```

---

## Future / roadmap

- **More MCP transports:** HTTP/SSE if you need remote hosts.
- **More integrations:** Sentry, Datadog, LogRocket, Axiom — pull in error logs and traces.
- **More runtimes:** Netlify, Railway, Fly.io — support deployment targets beyond Vercel.
- **Alerts:** Webhooks or notifications (Slack, Discord, email) when a crash is detected.
- **Report history:** Persist reports in a DB or file store instead of localStorage.


