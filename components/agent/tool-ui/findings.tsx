"use client";

import { useId, useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { Check, ClipboardCopy, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  isToolError,
  type FindingResult,
  type FixPromptResult,
  type GetFindingResult,
  type HealthCheckResult,
  type ListFindingsResult,
} from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";
import {
  formatTime,
  KeyValue,
  Pill,
  ToolCard,
  ToolError,
  ToolRunning,
  toneForState,
  type Tone,
} from "./shared";

const SEVERITY_ORDER: FindingResult["severity"][] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_TONE: Record<FindingResult["severity"], Tone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  info: "neutral",
};

const SEVERITY_BORDER: Record<FindingResult["severity"], string> = {
  critical: "border-s-destructive",
  high: "border-s-destructive/70",
  medium: "border-s-amber-500",
  low: "border-s-sky-500",
  info: "border-s-muted-foreground/40",
};

const severityRank = (finding: FindingResult) => SEVERITY_ORDER.indexOf(finding.severity);

function FindingCard({ finding }: { finding: FindingResult }) {
  return (
    <li
      data-severity={finding.severity}
      className={cn(
        "bg-background min-w-0 rounded-lg border border-s-4 p-3",
        SEVERITY_BORDER[finding.severity],
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Pill tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Pill>
        <span className="min-w-0 truncate font-medium">{finding.title}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {finding.projectName}
        {finding.serviceName ? ` · ${finding.serviceName}` : ""} · {finding.status}
        {formatTime(finding.lastSeenAt) ? ` · last seen ${formatTime(finding.lastSeenAt)}` : ""}
      </p>
      <p className="mt-1.5 text-sm whitespace-pre-line">{finding.summary}</p>
      {finding.evidence && finding.evidence.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {finding.evidence.map((item, index) => (
            <div key={index} className="contents">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0 break-all font-mono">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

const MANY_FINDINGS = 3;

function FindingsSummary({ findings }: { findings: FindingResult[] }) {
  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: findings.filter((finding) => finding.severity === severity).length,
  })).filter((entry) => entry.count > 0);
  const statusCount = (status: FindingResult["status"]) =>
    findings.filter((finding) => finding.status === status).length;
  const statusLine = (["new", "ongoing", "resolved"] as const)
    .map((status) => ({ status, count: statusCount(status) }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.status}`)
    .join(" · ");
  const top = [...findings].sort((a, b) => severityRank(a) - severityRank(b)).slice(0, 3);

  return (
    <div data-slot="agent-findings-summary" className="bg-muted/40 mb-2 rounded-lg border p-3">
      <div className="flex flex-wrap gap-1.5">
        {counts.map(({ severity, count }) => (
          <Pill key={severity} tone={SEVERITY_TONE[severity]}>
            {count} {severity}
          </Pill>
        ))}
      </div>
      {statusLine ? <p className="text-muted-foreground mt-2 text-xs">{statusLine}</p> : null}
      <p className="text-muted-foreground mt-3 mb-1 text-xs font-medium">Most severe</p>
      <ul className="flex flex-col gap-2">
        {top.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </ul>
    </div>
  );
}

export const FindingsToolUI: ToolCallMessagePartComponent<unknown, ListFindingsResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading findings…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  const many = result.findings.length > MANY_FINDINGS;

  return (
    <ToolCard
      slot="agent-findings"
      title={`Findings (${result.findings.length})`}
      subtitle="From the background checker"
      icon={ShieldAlert}
    >
      {result.findings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open findings.</p>
      ) : many ? (
        <>
          <FindingsSummary findings={result.findings} />
          <details className="group">
            <summary className="text-primary cursor-pointer text-xs font-medium underline-offset-2 hover:underline">
              Show all {result.findings.length} findings
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {result.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </ul>
          </details>
        </>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </ToolCard>
  );
};

export const FindingDetailToolUI: ToolCallMessagePartComponent<unknown, GetFindingResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading finding…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard slot="agent-finding" title="Finding" icon={ShieldAlert}>
      <ul>
        <FindingCard finding={result.finding} />
      </ul>
    </ToolCard>
  );
};

export const HealthCheckToolUI: ToolCallMessagePartComponent<unknown, HealthCheckResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Running health checks…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard
      slot="agent-health-check"
      title="Health check"
      subtitle="Same checks as the background job, run now"
      icon={ShieldCheck}
      action={<Pill tone={toneForState(result.status)}>{result.status}</Pill>}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <KeyValue label="Projects checked" value={result.projectsChecked} />
        <KeyValue
          label="Run ID"
          value={<code className="font-mono text-xs">{result.runId}</code>}
        />
      </dl>
      {result.error ? <ToolError message={result.error} /> : null}
    </ToolCard>
  );
};

const FIX_TARGETS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "codex", label: "Codex" },
  { id: "generic", label: "Generic" },
] as const;

type FixTarget = (typeof FIX_TARGETS)[number]["id"];

const isFixTarget = (value: unknown): value is FixTarget =>
  FIX_TARGETS.some((target) => target.id === value);

const fixTargetLabel = (id: FixTarget) => FIX_TARGETS.find((target) => target.id === id)?.label;

type FixPromptArgs = { findingId?: string; target?: string; extraContext?: string };

export const FixPromptToolUI: ToolCallMessagePartComponent<FixPromptArgs, FixPromptResult> = ({
  args,
  result,
  status,
}) => {
  const aui = useAui();
  const busy = useAuiState((s) => s.thread.isRunning);
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const idBase = useId();
  const [picked, setPicked] = useState<FixTarget | null>(null);
  const [adjust, setAdjust] = useState("");

  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Writing fix prompt…" /> : null;
  }

  const resultTarget = isToolError(result) ? undefined : result.target;
  const selected: FixTarget =
    picked ?? (isFixTarget(resultTarget) ? resultTarget : isFixTarget(args.target) ? args.target : "generic");
  const canRegenerate = Boolean(args.findingId) && !busy && status.type !== "running";

  const regenerate = () => {
    if (!args.findingId || !canRegenerate) return;
    const note = adjust.trim();
    aui
      .thread()
      .append(
        `Regenerate the fix prompt for finding ${args.findingId} for ${fixTargetLabel(selected)}, using generate_fix_prompt.${note ? ` Adjust it: ${note}` : ""}`,
      );
    setAdjust("");
  };

  return (
    <ToolCard
      slot="agent-fix-prompt"
      title="Fix prompt"
      subtitle={`Target: ${fixTargetLabel(selected)}`}
      icon={ClipboardCopy}
      action={
        isToolError(result) ? null : (
          <button
            type="button"
            onClick={() => copyToClipboard(result.prompt)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
          >
            {isCopied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <ClipboardCopy className="size-3.5" aria-hidden />
            )}
            <span role="status">{isCopied ? "Copied" : "Copy prompt"}</span>
          </button>
        )
      }
    >
      {isToolError(result) ? (
        <ToolError message={result.error} />
      ) : (
        <>
          <pre
            tabIndex={0}
            aria-label="Fix prompt"
            className="bg-muted max-h-72 overflow-auto rounded-lg p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words"
          >
            {result.prompt}
          </pre>
          {result.warnings.length > 0 ? (
            <ul className="mt-2 list-disc ps-5 text-xs text-amber-700 dark:text-amber-300">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {result.sources.length > 0 ? (
            <div className="mt-2">
              <p className="text-muted-foreground mb-1 text-xs">Sources</p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {result.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      {args.findingId && status.type !== "running" ? (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3">
          <span id={`${idBase}-target`} className="text-muted-foreground text-xs">
            Target agent
          </span>
          <div role="group" aria-labelledby={`${idBase}-target`} className="flex flex-wrap gap-1.5">
            {FIX_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                aria-pressed={selected === target.id}
                onClick={() => setPicked(target.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  selected === target.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {target.label}
              </button>
            ))}
          </div>
          <label htmlFor={`${idBase}-adjust`} className="text-muted-foreground text-xs">
            Adjust (optional)
          </label>
          <textarea
            id={`${idBase}-adjust`}
            rows={2}
            maxLength={1000}
            value={adjust}
            onChange={(event) => setAdjust(event.target.value)}
            placeholder="For example: keep the current runtime, only change the start command"
            className="bg-background focus-visible:ring-ring/50 resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              Sends a message so the assistant rewrites the prompt.
            </span>
            <button
              type="button"
              onClick={regenerate}
              disabled={!canRegenerate}
              className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Regenerate
            </button>
          </div>
        </div>
      ) : null}
    </ToolCard>
  );
};
