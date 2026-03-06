# Incident Response Copilot

A Next.js app for student developers: when your Vercel deployment fails, an AI agent (AWS Bedrock) automatically gathers evidence from Vercel, GitHub, and Supabase, then returns a ranked report of likely causes and fixes.

- **Settings-first:** Enter credentials once in the UI (stored in localStorage). No `.env` on the client; only AWS keys in `.env` for Bedrock.
- **Polling:** App polls Vercel every N seconds. On crash, it runs an investigation and shows a report with hypotheses and raw evidence.
- **Last build:** Dashboard shows the latest deployment plus a one-line AI summary so you can see it’s working.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- AWS Bedrock (Meta Llama 3) for investigation and build summary
- Optional: Vercel API, GitHub API, Supabase (only Vercel required)

## Prerequisites

- **Vercel:** API token, Project ID (and optional Team ID) from [vercel.com](https://vercel.com)
- **AWS:** Access key and secret for Bedrock (for investigation + build summary)
- **Optional:** GitHub token + repo owner/name; Supabase project URL + service role key

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

## Pushing to GitHub

### Create a new repo (on GitHub)

1. Go to [github.com/new](https://github.com/new).
2. Name it (e.g. `incident-response-copilot`), leave it empty (no README/license).
3. Copy the repo URL (e.g. `https://github.com/YOUR_USERNAME/incident-response-copilot.git`).

### Push from this project

```bash
cd /path/to/first_five_minutes_cursor

# If this folder isn’t a git repo yet
git init

# Add GitHub as remote (use your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/incident-response-copilot.git

# Stage and commit
git add .
git commit -m "Initial commit: Incident Response Copilot"

# Push (create main branch if needed)
git branch -M main
git push -u origin main
```

If the folder is already a git repo with another remote:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/incident-response-copilot.git
git add .
git commit -m "Initial commit: Incident Response Copilot"
git push -u origin main
```

## Project layout

- `app/page.tsx` — Dashboard (polling, last build, reports)
- `app/settings/page.tsx` — Credentials form
- `app/api/poll/route.ts` — Vercel status + latest deployment
- `app/api/investigate/route.ts` — Run agent, return report
- `app/api/summarize-build/route.ts` — One-line AI build summary
- `app/api/status/route.ts` — Connection checks (Vercel/GitHub/Supabase)
- `app/api/tools/*` — Proxies to Vercel/GitHub/Supabase tools
- `lib/agent.ts` — Bedrock + MCP-style tools orchestration
- `lib/tools/` — vercel, github, supabase tools

## Future / roadmap

- **MCP server:** Expose the same tools (Vercel logs/history, GitHub commits, Supabase check) via an MCP server so other agents or IDEs can call them; keep the existing Next.js API routes as one client of that server.
- **More integrations:** Add optional connectors for error/monitoring tools (e.g. Sentry, Datadog, LogRocket, Axiom) and source more evidence from logs and traces, not only Vercel/GitHub/Supabase.
- **More runtimes:** Support other deployment targets (e.g. Netlify, Railway, Fly.io) with similar “last deployment + logs” APIs so the copilot isn’t tied only to Vercel.
- **Alerts:** Optional webhook or notification (e.g. Slack, Discord, email) when a crash is detected and when a report is ready.
- **Report history:** Persist reports in a DB or file store instead of (or in addition to) localStorage for cross-device and long-term history.

## License

MIT
