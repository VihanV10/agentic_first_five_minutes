"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  isConfigured,
  getCredentialsHeaders,
  getStoredConfig,
} from "@/lib/client-config";
import type { InvestigationReport } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import ReportCard from "@/components/ReportCard";

const REPORTS_STORAGE_KEY = "incident-copilot-reports";

function formatTimeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

function loadReportHistory(): InvestigationReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? (parsed.filter((r) => r && typeof r === "object" && "id" in r) as InvestigationReport[])
      : [];
  } catch {
    return [];
  }
}

function saveReportHistory(reports: InvestigationReport[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
}

type AppStatus = "all_good" | "investigating" | "crash_detected";

type LatestDeployment = {
  id: string;
  url?: string;
  state?: string;
  created?: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [connection, setConnection] = useState<{
    vercel: boolean;
    github: boolean;
    supabase: boolean;
  } | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus>("all_good");
  const [latestDeployment, setLatestDeployment] =
    useState<LatestDeployment | null>(null);
  const [lastBuildSummary, setLastBuildSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [latestReport, setLatestReport] = useState<InvestigationReport | null>(
    null
  );
  const [reportHistory, setReportHistory] = useState<InvestigationReport[]>([]);
  const investigatingRef = useRef(false);
  const summarizedIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isConfigured()) {
      router.replace("/settings");
      return;
    }
    const history = loadReportHistory();
    setReportHistory(history);
    if (history.length > 0) setLatestReport((prev) => prev ?? history[0]);
  }, [mounted, router]);

  const fetchStatus = async () => {
    const headers = getCredentialsHeaders();
    if (!headers["x-vercel-token"]) return;
    try {
      const res = await fetch("/api/status", { headers });
      if (res.ok) {
        const data = await res.json();
        setConnection({
          vercel: !!data.vercel,
          github: !!data.github,
          supabase: !!data.supabase,
        });
      }
    } catch {
      setConnection({ vercel: false, github: false, supabase: false });
    }
  };

  useEffect(() => {
    if (!mounted || !isConfigured()) return;
    fetchStatus();
  }, [mounted]);

  const poll = async () => {
    const headers = getCredentialsHeaders();
    if (!headers["x-vercel-token"]) return;
    if (investigatingRef.current) return;
    try {
      const res = await fetch("/api/poll", { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data.latestDeployment) {
        setLatestDeployment(data.latestDeployment);
        if (
          data.latestDeployment.id &&
          data.latestDeployment.id !== summarizedIdRef.current
        ) {
          summarizedIdRef.current = data.latestDeployment.id;
          setSummaryLoading(true);
          setLastBuildSummary(null);
          fetch(
            `/api/summarize-build?deploymentId=${encodeURIComponent(data.latestDeployment.id)}`,
            { headers }
          )
            .then((r) => r.ok && r.json())
            .then((j) => j?.summary && setLastBuildSummary(j.summary))
            .catch(() => setLastBuildSummary("Summary unavailable."))
            .finally(() => setSummaryLoading(false));
        }
      }
      if (data.crashDetected && data.deployment?.id) {
        investigatingRef.current = true;
        setAppStatus("investigating");
        try {
          const invRes = await fetch("/api/investigate", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({
              deploymentId: data.deployment.id,
              crashTimestamp: data.deployment.created ?? Date.now(),
            }),
          });
          if (invRes.ok) {
            const report = (await invRes.json()) as InvestigationReport;
            setLatestReport(report);
            setAppStatus("crash_detected");
            setReportHistory((prev) => {
              const next = [report, ...prev].slice(0, 50);
              saveReportHistory(next);
              return next;
            });
          } else {
            setAppStatus("all_good");
          }
        } finally {
          investigatingRef.current = false;
        }
      } else {
        setAppStatus("all_good");
      }
    } catch {
      setAppStatus("all_good");
    }
  };

  useEffect(() => {
    if (!mounted || !isConfigured()) return;
    const config = getStoredConfig();
    const intervalMs = (config?.pollingIntervalSeconds ?? 60) * 1000;
    poll();
    const t = setInterval(poll, intervalMs);
    return () => clearInterval(t);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Incident Response Copilot
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {connection && (
              <>
                <StatusBadge
                  status={connection.vercel ? "connected" : "disconnected"}
                  label="Vercel"
                />
                <StatusBadge
                  status={connection.github ? "connected" : "disconnected"}
                  label="GitHub"
                />
                <StatusBadge
                  status={connection.supabase ? "connected" : "disconnected"}
                  label="Supabase"
                />
              </>
            )}
            <Link
              href="/settings"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            App status:
          </span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              appStatus === "all_good"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : appStatus === "investigating"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {appStatus === "all_good"
              ? "All Good"
              : appStatus === "investigating"
                ? "Investigating…"
                : "Crash Detected"}
          </span>
        </div>

        {latestDeployment && (
          <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              Last build
            </h2>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                  {latestDeployment.id}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-sm font-medium ${
                    (latestDeployment.state ?? "").toUpperCase() === "READY"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : (latestDeployment.state ?? "").toUpperCase() === "ERROR"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {latestDeployment.state ?? "—"}
                </span>
                {latestDeployment.created && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatTimeAgo(latestDeployment.created)}
                  </span>
                )}
              </div>
              {latestDeployment.url && (
                <a
                  href={
                    latestDeployment.url.startsWith("http")
                      ? latestDeployment.url
                      : `https://${latestDeployment.url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {latestDeployment.url}
                </a>
              )}
              <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
                <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  AI summary
                </span>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {summaryLoading
                    ? "Loading…"
                    : lastBuildSummary ?? "—"}
                </p>
              </div>
            </div>
          </section>
        )}

        {latestReport && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              Latest report
            </h2>
            <ReportCard report={latestReport} />
          </section>
        )}

        {reportHistory.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              Report history
            </h2>
            <ul className="space-y-4">
              {reportHistory
                .filter((r) => r.id !== latestReport?.id)
                .slice(0, 10)
                .map((r) => (
                  <li key={r.id}>
                    <ReportCard report={r} />
                  </li>
                ))}
            </ul>
          </section>
        )}

        {!latestReport && reportHistory.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">
            No incidents yet. The app is polling Vercel; when a deployment
            fails, a report will appear here.
          </p>
        )}
      </main>
    </div>
  );
}
