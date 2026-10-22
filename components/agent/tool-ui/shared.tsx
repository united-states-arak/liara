"use client";

import { useState, type ReactNode } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ChevronDown, ChevronRight, CircleAlert, Loader2, type LucideIcon } from "lucide-react";
import type { ToolErrorResult } from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export function toneForState(state: string | undefined | null): Tone {
  if (!state) return "neutral";
  const value = state.toLowerCase();
  if (/fail|error|crash|dead|down|reject/.test(value)) return "danger";
  if (/build|pend|queue|deploy|start|progress|provision/.test(value)) return "warning";
  if (/run|ready|active|success|done|online|complete|healthy|ok/.test(value)) {
    return "success";
  }
  return "neutral";
}

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Cards that need attention (approvals, questions, results the user copies) keep the full card look. */
const CARD_SLOTS = new Set([
  "agent-write-action",
  "agent-ask-user",
  "agent-architecture",
  "agent-deploy-prompt",
  "agent-fix-prompt",
]);

export function ToolCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  slot,
  collapsible = false,
  defaultOpen,
  summary,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  slot: string;
  /** Card variant only: header becomes a toggle. Entries are always toggles. */
  collapsible?: boolean;
  /** Entries start collapsed unless this is true; cards start open. */
  defaultOpen?: boolean;
  /** Shown under the header while collapsed (for example citation chips). */
  summary?: ReactNode;
}) {
  const isCard = CARD_SLOTS.has(slot);
  const [open, setOpen] = useState(defaultOpen ?? isCard);

  if (!isCard) {
    return (
      <section data-slot={slot} data-state={open ? "open" : "closed"} className="my-0.5 w-full max-w-full text-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-start transition-colors"
          >
            {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
            <span className="text-foreground/80 group-hover:text-foreground shrink-0 font-medium">{title}</span>
            {subtitle ? <span className="min-w-0 truncate text-xs">{subtitle}</span> : null}
            <ChevronRight
              className={cn(
                "ms-auto size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                open ? "rotate-90" : "rtl:rotate-180",
              )}
              aria-hidden
            />
          </button>
          {action}
        </div>
        {!open && summary ? <div className="ms-1.5 mt-1">{summary}</div> : null}
        {open ? <div className="border-border ms-2.5 mt-1 border-s ps-3 pb-1">{children}</div> : null}
      </section>
    );
  }

  const expanded = !collapsible || open;
  const heading = (
    <>
      {Icon ? <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1 text-start">
        <h3 className="truncate font-medium">{title}</h3>
        {subtitle ? <p className="text-muted-foreground truncate text-xs">{subtitle}</p> : null}
      </div>
    </>
  );
  return (
    <section
      data-slot={slot}
      data-state={expanded ? "open" : "closed"}
      className="bg-card text-card-foreground my-2 w-full max-w-full rounded-xl border p-3 text-sm shadow-xs"
    >
      <header className={cn("flex items-start gap-2", expanded ? "mb-2" : "mb-0")}>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setOpen((value) => !value)}
            className="flex min-w-0 flex-1 items-start gap-2"
          >
            {heading}
            <ChevronDown
              className={cn(
                "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform motion-reduce:transition-none",
                expanded ? "rotate-180" : "",
              )}
              aria-hidden
            />
          </button>
        ) : (
          heading
        )}
        {action}
      </header>
      {!expanded && summary ? <div className="mt-2">{summary}</div> : null}
      {expanded ? children : null}
    </section>
  );
}

export function ToolRunning({ label }: { label: string }) {
  return (
    <div role="status" className="text-muted-foreground my-0.5 flex items-center gap-2 px-1.5 py-1 text-sm">
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="shimmer">{label}</span>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  list_projects: "load your apps",
  get_project: "load this app",
  get_logs: "load the logs",
  get_metrics: "load the metrics",
  list_releases: "load the releases",
  get_events: "load the events",
  get_account_plans: "load the plans",
  search_liara_docs: "search the docs",
  read_liara_doc: "read this doc page",
  list_findings: "load the findings",
  get_finding: "load this finding",
  run_health_check: "run the health check",
  generate_fix_prompt: "write the fix prompt",
  restart_project: "restart the app",
  set_project_scale: "change the app's scale",
  resize_project: "change the plan",
  update_env_vars: "update the environment variables",
  create_project: "create the app",
  deploy_project: "deploy the app",
  deploy_image: "deploy the image",
  add_domain: "add the domain",
  enable_ssl: "turn on SSL",
  liara_api_get: "read from Liara",
  liara_api_write: "make the change on Liara",
  wait_for_liara: "wait for Liara",
};

const STACK_LINE = /\n\s*at\s|\bat\s+\S+\s+\(|node_modules|\.[cm]?[jt]sx?:\d+/;
const MAX_DETAIL = 200;

/** A short, stack-free sentence about an error, or undefined when nothing safe is available. */
export function safeMessage(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : typeof value === "object" &&
            value !== null &&
            "error" in value &&
            typeof value.error === "string"
          ? value.error
          : undefined;
  if (!raw || STACK_LINE.test(raw)) return undefined;
  const line = raw.trim().split("\n")[0]?.trim() ?? "";
  if (!line) return undefined;
  return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL - 1)}…` : line;
}

export function ToolFailure({
  toolName,
  detail,
  children,
}: {
  toolName?: string;
  detail?: string;
  children?: ReactNode;
}) {
  const label = toolName ? (TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ")) : undefined;
  return (
    <section
      role="alert"
      data-slot="agent-tool-failure"
      className="border-destructive/30 bg-destructive/5 my-2 flex w-full items-start gap-3 rounded-xl border p-3 text-sm"
    >
      <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label ? `Could not ${label}.` : "This step did not finish."}</p>
        {detail ? <p className="text-muted-foreground mt-0.5 break-words text-xs">{detail}</p> : null}
        {children}
        <p className="text-muted-foreground mt-1 text-xs">
          Try again in a moment, or ask the assistant to retry this step.
        </p>
      </div>
    </section>
  );
}

export function ToolError({ message, result }: { message?: string; result?: ToolErrorResult }) {
  const text = message ?? result?.error ?? "";
  const liara = result?.liaraResponse;
  const hasLiara = typeof result?.status === "number" || !!liara;
  if (!result || !hasLiara) return <ToolFailure detail={safeMessage(text)} />;

  const liaraMessage = safeMessage(liara?.message) ?? safeMessage(liara?.errors);
  const detail = liaraMessage
    ? `Liara said: ${liaraMessage}`
    : (safeMessage(text) ?? "Liara could not complete this step.");
  const extra = [liara?.errors, liara?.raw].filter(Boolean).join("\n");
  return (
    <ToolFailure detail={detail}>
      <details className="text-muted-foreground mt-1 text-xs">
        <summary className="cursor-pointer select-none">Details</summary>
        <div dir="ltr" className="mt-1 break-words font-mono">
          {result.request ? (
            <p>
              {result.request.method} {result.request.path}
              {typeof result.status === "number" ? ` → HTTP ${result.status}` : ""}
            </p>
          ) : typeof result.status === "number" ? (
            <p>HTTP {result.status}</p>
          ) : null}
          {extra ? <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{extra}</pre> : null}
        </div>
      </details>
    </ToolFailure>
  );
}

/**
 * Wraps a tool UI so that a tool which threw (status `incomplete`, reason `error`)
 * shows a friendly failure card instead of nothing or a raw error dump.
 */
export function withToolFailure<TArgs, TResult>(
  View: ToolCallMessagePartComponent<TArgs, TResult>,
): ToolCallMessagePartComponent<TArgs, TResult> {
  const Guarded: ToolCallMessagePartComponent<TArgs, TResult> = (props) => {
    const { status, toolName } = props;
    if (status.type === "incomplete" && status.reason === "error") {
      return <ToolFailure toolName={toolName} detail={safeMessage(status.error)} />;
    }
    return <View {...props} />;
  };
  Guarded.displayName = `WithToolFailure(${View.displayName ?? "ToolUI"})`;
  return Guarded;
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

export function formatTime(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
