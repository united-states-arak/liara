import { CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyError } from "./format";
import type { FindingStatus, RunStatus, RunTrigger, Severity } from "./types";

export const SEVERITY_META: Record<
  Severity,
  { label: string; badge: string; accent: string; dot: string }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-600 text-white dark:bg-red-500",
    accent: "border-l-red-600",
    dot: "bg-red-600",
  },
  high: {
    label: "High",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    accent: "border-l-red-500",
    dot: "bg-red-500",
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    accent: "border-l-amber-500",
    dot: "bg-amber-500",
  },
  low: {
    label: "Low",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    accent: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  info: {
    label: "Info",
    badge: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
    accent: "border-l-zinc-400",
    dot: "bg-zinc-400",
  },
};

const RUN_STATUS_META: Record<RunStatus, { label: string; className: string }> = {
  running: {
    label: "Running",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  ok: {
    label: "OK",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  partial: {
    label: "Partial",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  skipped: {
    label: "Skipped",
    className: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  },
};

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return <Badge className={meta.badge}>{meta.label}</Badge>;
}

export function StatusPill({ status }: { status: FindingStatus }) {
  if (status === "ongoing") {
    return (
      <Badge className="bg-muted text-muted-foreground ring-1 ring-border ring-inset">
        Ongoing
      </Badge>
    );
  }
  return <Badge className="bg-foreground text-background">New</Badge>;
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS_META[status];
  return (
    <Badge className={meta.className}>
      {status === "running" && <LoaderCircle className="size-3 animate-spin" />}
      {meta.label}
    </Badge>
  );
}

export function TriggerBadge({ trigger }: { trigger: RunTrigger }) {
  return (
    <Badge className="bg-muted text-muted-foreground ring-1 ring-border ring-inset">
      {trigger === "manual" ? "Manual" : "Scheduled"}
    </Badge>
  );
}

export function ErrorNotice({
  message,
  title = "Error",
  className,
}: {
  message: string;
  title?: string;
  className?: string;
}) {
  const kind = classifyError(message);
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{kind ?? title}</p>
        <p className="font-mono text-xs break-words whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}
