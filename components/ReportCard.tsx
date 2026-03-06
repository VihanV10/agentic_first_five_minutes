"use client";

import type { InvestigationReport } from "@/lib/types";
import EvidencePanel from "./EvidencePanel";

const EVIDENCE_LABELS: Record<string, string> = {
  vercel_logs: "Vercel deployment logs",
  vercel_history: "Vercel deployment history",
  github_commits: "GitHub recent commits",
  supabase_errors: "Supabase DB status",
  _claude_error: "Claude API error",
};

interface ReportCardProps {
  report: InvestigationReport;
}

export default function ReportCard({ report }: ReportCardProps) {
  const date = new Date(report.crashTimestamp).toLocaleString();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Crash: {date}
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs dark:bg-gray-800">
          {report.deploymentId}
        </span>
      </div>

      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Ranked causes
      </h3>
      <ul className="mb-6 space-y-3">
        {report.hypotheses.map((h, i) => (
          <li
            key={i}
            className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                {h.cause}
              </span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {Math.round(h.confidence)}%
              </span>
            </div>
            {h.suggestedFix && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {h.suggestedFix}
              </p>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Raw evidence
      </h3>
      <div className="space-y-2">
        {Object.entries(report.evidence).map(([key, result]) => (
          <EvidencePanel
            key={key}
            title={EVIDENCE_LABELS[key] ?? key}
            result={result}
          />
        ))}
      </div>
    </div>
  );
}
