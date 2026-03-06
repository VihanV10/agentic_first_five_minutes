"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredConfig, setStoredConfig } from "@/lib/client-config";
import type { UserConfig } from "@/lib/types";

const DEFAULT_POLLING = 60;

export default function SettingsForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<UserConfig>>({
    vercelToken: "",
    vercelProjectId: "",
    vercelTeamId: "",
    githubToken: "",
    githubOwner: "",
    githubRepo: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    pollingIntervalSeconds: DEFAULT_POLLING,
  });

  useEffect(() => {
    const c = getStoredConfig();
    if (c) setForm((prev) => ({ ...prev, ...c }));
  }, []);

  const update = (key: keyof UserConfig, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.vercelToken?.trim() || !form.vercelProjectId?.trim()) {
      setError("Vercel API token and Project ID are required.");
      return;
    }
    const interval =
      typeof form.pollingIntervalSeconds === "number"
        ? form.pollingIntervalSeconds
        : parseInt(String(form.pollingIntervalSeconds), 10) || DEFAULT_POLLING;
    const toSave: Partial<UserConfig> = {
      ...form,
      vercelToken: form.vercelToken!.trim(),
      vercelProjectId: form.vercelProjectId!.trim(),
      vercelTeamId: form.vercelTeamId?.trim() || undefined,
      githubToken: form.githubToken?.trim() || undefined,
      githubOwner: form.githubOwner?.trim() || undefined,
      githubRepo: form.githubRepo?.trim() || undefined,
      supabaseUrl: form.supabaseUrl?.trim() || undefined,
      supabaseServiceRoleKey: form.supabaseServiceRoleKey?.trim() || undefined,
      pollingIntervalSeconds: Math.max(10, Math.min(3600, interval)),
    };
    setLoading(true);
    setStoredConfig(toSave);
    router.push("/");
    setLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-xl space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
        Incident Response Copilot — Settings
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Enter your project credentials below. They are stored only in your
        browser (localStorage) and sent to the API on each request.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Vercel
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                API token *
              </label>
              <input
                type="password"
                value={form.vercelToken ?? ""}
                onChange={(e) => update("vercelToken", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Vercel token"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                Project ID *
              </label>
              <input
                type="text"
                value={form.vercelProjectId ?? ""}
                onChange={(e) => update("vercelProjectId", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="prj_..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                Team ID (optional)
              </label>
              <input
                type="text"
                value={form.vercelTeamId ?? ""}
                onChange={(e) => update("vercelTeamId", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="team_..."
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            GitHub (optional)
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                Token (repo read)
              </label>
              <input
                type="password"
                value={form.githubToken ?? ""}
                onChange={(e) => update("githubToken", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="ghp_..."
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  Owner
                </label>
                <input
                  type="text"
                  value={form.githubOwner ?? ""}
                  onChange={(e) => update("githubOwner", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="username or org"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  Repo name
                </label>
                <input
                  type="text"
                  value={form.githubRepo ?? ""}
                  onChange={(e) => update("githubRepo", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="repo-name"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Supabase (optional)
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                Project URL
              </label>
              <input
                type="url"
                value={form.supabaseUrl ?? ""}
                onChange={(e) => update("supabaseUrl", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="https://xxx.supabase.co"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                Service role key
              </label>
              <input
                type="password"
                value={form.supabaseServiceRoleKey ?? ""}
                onChange={(e) => update("supabaseServiceRoleKey", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="eyJ..."
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Polling interval (seconds) *
          </label>
          <input
            type="number"
            min={10}
            max={3600}
            value={form.pollingIntervalSeconds ?? DEFAULT_POLLING}
            onChange={(e) =>
              update("pollingIntervalSeconds", parseInt(e.target.value, 10) || DEFAULT_POLLING)
            }
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Default 60. Min 10, max 3600.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save and go to Dashboard"}
        </button>
      </div>
    </form>
  );
}
