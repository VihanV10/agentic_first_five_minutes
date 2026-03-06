"use client";

import { useState } from "react";
import type { ToolResult } from "@/lib/types";

interface EvidencePanelProps {
  title: string;
  result: ToolResult;
}

export default function EvidencePanel({ title, result }: EvidencePanelProps) {
  const [open, setOpen] = useState(false);
  const text =
    result.success && result.data != null
      ? JSON.stringify(result.data, null, 2)
      : result.error ?? "No data";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <span>
          {title}
          {result.success ? (
            <span className="ml-2 text-green-600 dark:text-green-400">OK</span>
          ) : (
            <span className="ml-2 text-red-600 dark:text-red-400">Error</span>
          )}
        </span>
        <span className="text-gray-400">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {text}
        </pre>
      )}
    </div>
  );
}
