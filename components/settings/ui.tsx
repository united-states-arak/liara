"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "error" | "neutral";

export type NoticeState = { tone: "success" | "error"; text: string };

const badgeTones: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  error: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ notice }: { notice: NoticeState | null }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={cn(
        "text-sm",
        notice.tone === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      )}
    >
      {notice.text}
    </p>
  );
}
