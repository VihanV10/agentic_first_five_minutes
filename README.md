# Incident Response Copilot

A Next.js app for student developers: when your Vercel deployment fails, an AI agent (AWS Bedrock) automatically gathers evidence from Vercel, GitHub, and Supabase, then returns a ranked report of likely causes and fixes.

---

## What It Does

You connect your project once via a settings form. The app then:

1. **Polls Vercel** every N seconds (default 60) to check deployment status.
2. **Shows your last build** — deployment ID, state (Ready/Error/Building), time ago, and a one-line AI summary so you know it’s working.
3. **On crash** — when a deployment fails, an AI agent runs in the background, fetches logs from Vercel, recent commits from GitHub (if configured), and DB status from Supabase (if configured), then sends everything to AWS Bedrock.
4. **Renders a report** — ranked hypotheses with confidence scores and suggested fixes, plus collapsible raw evidence per source.

No terminal, no `.env` for project credentials — everything is configured in the UI. Only AWS keys live in `.env` for the AI.

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
    └─► POST /api/investigate (when crash) ──► Agent runs tools in parallel:
            │
            ├─► get_deployment_logs (Vercel)
            ├─► get_deployment_history (Vercel)
            ├─► get_recent_commits (GitHub, if configured)
            ├─► get_db_errors (Supabase, if configured)
            │
            └─► All evidence → Bedrock → ranked hypotheses
```

Credentials are stored in **localStorage** and sent in request headers on every API call. The server never stores them.

### What you see

- **Settings:** Single form — Vercel (token, project ID, team ID), GitHub (token, owner, repo), Supabase (URL, service key), polling interval. Only Vercel is required.
- **Dashboard:** Connection badges (Vercel / GitHub / Supabase), app status (All Good / Investigating… / Crash Detected), Last build card, Latest report (when a crash was investigated), Report history list.
- **Report card:** Crash timestamp, deployment ID, ranked causes with confidence % and suggested fix, collapsible raw evidence per source.

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
```

Create keys in AWS Console → IAM → Users → Security credentials → Create access key. The user needs `bedrock:InvokeModel` (e.g. `AmazonBedrockFullAccess` or a minimal policy).

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll land on **Settings**: enter at least Vercel token and Project ID, then save. You’re redirected to the dashboard; polling starts and the “Last build” card appears when there’s a deployment.

---

## Pushing to GitHub

### Create a new repo (on GitHub)

1. Go to [github.com/new](https://github.com/new).
2. Name it (e.g. `incident-response-copilot`), leave it empty (no README/license).
3. Copy the repo URL (e.g. `https://github.com/YOUR_USERNAME/incident-response-copilot.git`).

### Push from this project

```bash
cd /path/to/incident-response-copilot

# If this folder isn't a git repo yet
git init
git remote add origin https://github.com/YOUR_USERNAME/incident-response-copilot.git

# Stage, commit, push
git add .
git commit -m "Initial commit: Incident Response Copilot"
git branch -M main
git push -u origin main
```

If already connected to a repo:

```bash
git add .
git commit -m "Improve README: add flow, architecture, and usage"
git push
```

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
| `lib/agent.ts` | Bedrock + MCP-style tools orchestration |
| `lib/tools/` | vercel, github, supabase tools |

---

## Future / roadmap

- **MCP server:** Expose the same tools (Vercel logs/history, GitHub commits, Supabase check) via an MCP server so other agents or IDEs can call them.
- **More integrations:** Sentry, Datadog, LogRocket, Axiom — pull in error logs and traces.
- **More runtimes:** Netlify, Railway, Fly.io — support deployment targets beyond Vercel.
- **Alerts:** Webhooks or notifications (Slack, Discord, email) when a crash is detected.
- **Report history:** Persist reports in a DB or file store instead of localStorage.

---

## License

MIT
