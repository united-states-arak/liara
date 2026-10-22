"use client";

import { CircleAlert } from "lucide-react";
import { useHistoryErrorStore } from "@/lib/agent/history-error-store";

export function HistoryErrorBanner() {
  const error = useHistoryErrorStore((state) => state.error);
  if (!error) return null;
  return (
    <div
      role="alert"
      data-slot="history-error-banner"
      className="border-destructive bg-destructive/10 text-destructive flex items-start gap-2 border-b px-4 py-2 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">Could not load this chat&apos;s messages: {error}</p>
    </div>
  );
}
