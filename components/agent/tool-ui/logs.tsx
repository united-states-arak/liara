"use client";

import { useMemo, useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Check, Copy, FileText, Search } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { isToolError, type GetLogsResult } from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

const ERROR_LINE =
  /\b(error|exception|fatal|panic|traceback|fail(?:ed|ure)?|ECONNREFUSED|ETIMEDOUT|timeout|killed|OOM)\b|\b5\d\d\b/i;
const WARN_LINE = /\b(warn|warning|deprecated|retrying|retry|slow)\b/i;

type LogLine = Extract<GetLogsResult, { lines: unknown }>["lines"][number];
type Severity = "error" | "warn" | "info";
type Filter = "all" | "errors" | "warnings";

const SEVERITY_ROW: Record<Severity, string> = {
  error: "border-s-destructive bg-destructive/10 text-destructive",
  warn: "border-s-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  info: "border-s-transparent",
};

function severityOf(message: string): Severity {
  if (ERROR_LINE.test(message)) return "error";
  if (WARN_LINE.test(message)) return "warn";
  return "info";
}

function LogLineRow({ line, severity }: { line: LogLine; severity: Severity }) {
  return (
    <li
      data-severity={severity}
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-3 border-s-2 px-2 py-0.5",
        SEVERITY_ROW[severity],
      )}
    >
      <span className="text-muted-foreground whitespace-nowrap">
        {line.time ? new Date(line.time).toLocaleTimeString() : ""}
      </span>
      <span className="break-all whitespace-pre-wrap">{line.message}</span>
    </li>
  );
}

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "warnings", label: "Warnings" },
];

function LogsBody({ result }: { result: Extract<GetLogsResult, { lines: unknown }> }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const tagged = useMemo(
    () => result.lines.map((line) => ({ line, severity: severityOf(line.message) })),
    [result.lines],
  );
  const counts = useMemo(
    () => ({
      errors: tagged.filter((entry) => entry.severity === "error").length,
      warnings: tagged.filter((entry) => entry.severity === "warn").length,
    }),
    [tagged],
  );
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tagged.filter((entry) => {
        if (filter === "errors" && entry.severity !== "error") return false;
        if (filter === "warnings" && entry.severity !== "warn") return false;
        return needle === "" || entry.line.message.toLowerCase().includes(needle);
      }),
    [tagged, filter, needle],
  );
  const text = useMemo(
    () => visible.map(({ line }) => `${line.time ?? ""} ${line.message}`.trim()).join("\n"),
    [visible],
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Pill>{result.count} lines</Pill>
        {result.truncated ? <Pill tone="warning">showing newest {result.lines.length}</Pill> : null}
        <Pill tone={counts.errors > 0 ? "danger" : "success"}>
          {counts.errors} error {counts.errors === 1 ? "line" : "lines"}
        </Pill>
        <span className="text-muted-foreground">
          since {new Date(result.since).toLocaleString()}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by severity" className="flex gap-1">
          {FILTERS.map((option) => {
            const count =
              option.id === "errors"
                ? counts.errors
                : option.id === "warnings"
                  ? counts.warnings
                  : result.lines.length;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  filter === option.id ? "bg-muted font-medium" : "hover:bg-muted/60",
                )}
              >
                {option.label} <span className="text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <label className="relative min-w-0 flex-1 basis-40">
          <span className="sr-only">Filter log lines</span>
          <Search
            className="text-muted-foreground pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter lines"
            className="bg-background focus-visible:ring-ring/50 w-full rounded-md border py-1 ps-7 pe-2 font-mono text-xs outline-none focus-visible:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={() => copyToClipboard(text)}
          disabled={text.length === 0}
          className="hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
        >
          {isCopied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          <span role="status">{isCopied ? "Copied" : `Copy ${visible.length}`}</span>
        </button>
      </div>
      {result.lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">No log lines in this window.</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No lines match this filter.</p>
      ) : (
        <ol
          aria-label="Log lines"
          className="bg-muted/40 max-h-72 overflow-auto rounded-lg py-1 font-mono text-xs leading-5"
        >
          {visible.map(({ line, severity }, index) => (
            <LogLineRow key={`${line.time ?? ""}-${index}`} line={line} severity={severity} />
          ))}
        </ol>
      )}
    </>
  );
}

export const LogsViewerToolUI: ToolCallMessagePartComponent<unknown, GetLogsResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Fetching logs…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard slot="agent-logs" title={`Logs · ${result.name}`} icon={FileText}>
      <LogsBody result={result} />
    </ToolCard>
  );
};
