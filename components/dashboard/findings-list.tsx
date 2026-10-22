"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  PlugZap,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchFixPrompt } from "./api";
import { SEVERITY_META, SeverityBadge, StatusPill } from "./badges";
import { copyText } from "./clipboard";
import { formatAbsolute, formatRelative, pluralize } from "./format";
import { useFlash } from "./hooks";
import { FixPromptDialog } from "./fix-prompt-dialog";
import { SEVERITIES, type FindingRow, type ResourceKind } from "./types";

const KIND_LABELS: Record<ResourceKind, string> = {
  app: "App",
  database: "Database",
  bucket: "Bucket",
  vm: "VM",
  ai_workspace: "AI workspace",
  mail_server: "Mail server",
  dns_zone: "DNS zone",
};

export function FindingsList({
  findings,
  tokenConfigured,
  hasRuns,
  now,
  settingsAction,
}: {
  findings: FindingRow[];
  tokenConfigured: boolean;
  hasRuns: boolean;
  now: number;
  settingsAction?: ReactNode;
}) {
  const active = findings.filter((finding) => finding.status !== "resolved");

  const groups = SEVERITIES.map((severity) => ({
    severity,
    items: active
      .filter((finding) => finding.severity === severity)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)),
  })).filter((group) => group.items.length > 0);

  return (
    <section aria-labelledby="findings-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="findings-heading" className="text-base font-semibold tracking-tight">
          Findings
        </h2>
        {active.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {pluralize(active.length, "active finding")}
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyFindings
          tokenConfigured={tokenConfigured}
          hasRuns={hasRuns}
          settingsAction={settingsAction}
        />
      ) : (
        groups.map((group) => (
          <div key={group.severity} className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span
                className={cn("size-2 rounded-full", SEVERITY_META[group.severity].dot)}
                aria-hidden
              />
              {SEVERITY_META[group.severity].label}
              <span className="font-normal normal-case">({group.items.length})</span>
            </h3>
            <ul className="space-y-2">
              {group.items.map((finding) => (
                <li key={finding.id}>
                  <FindingCard finding={finding} now={now} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function EmptyFindings({
  tokenConfigured,
  hasRuns,
  settingsAction,
}: {
  tokenConfigured: boolean;
  hasRuns: boolean;
  settingsAction?: ReactNode;
}) {
  if (!tokenConfigured) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-card p-6">
        <PlugZap className="size-5 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">Connect your Liara account to start monitoring</p>
          <p className="text-sm text-muted-foreground">
            Checks run automatically once an account is connected.
          </p>
        </div>
        {settingsAction}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-card p-6">
      <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{hasRuns ? "No active findings" : "No checks have run yet"}</p>
        <p className="text-sm text-muted-foreground">
          {hasRuns
            ? "Nothing needs attention in your projects right now."
            : "Run a check to scan your projects for problems."}
        </p>
      </div>
    </div>
  );
}

function FindingCard({ finding, now }: { finding: FindingRow; now: number }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [copied, flashCopied] = useFlash(2000);

  const copy = useMutation({
    mutationFn: async () => {
      const ok = await copyText(
        fetchFixPrompt(finding.id, { target: "claude-code" }).then((result) => result.prompt),
      );
      if (!ok) {
        throw new Error("Copy was blocked. Use Adjust prompt to copy it manually.");
      }
    },
    onSuccess: () => flashCopied(),
  });

  const label = finding.serviceName
    ? `${finding.projectName} / ${finding.serviceName}`
    : finding.projectName;

  return (
    <article
      className={cn(
        "rounded-lg border border-l-4 bg-card text-card-foreground",
        SEVERITY_META[finding.severity].accent,
      )}
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <StatusPill status={finding.status} />
          <span className="rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">
            {KIND_LABELS[finding.kind]}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
        </div>

        <div className="space-y-1">
          <h4 className="text-sm leading-snug font-medium">{finding.title}</h4>
          <p className="line-clamp-2 text-sm text-muted-foreground">{finding.summary}</p>
        </div>

        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>
            First seen{" "}
            <time dateTime={finding.firstSeenAt} title={formatAbsolute(finding.firstSeenAt)}>
              {formatRelative(finding.firstSeenAt, now)}
            </time>
          </span>
          <span>
            Last seen{" "}
            <time dateTime={finding.lastSeenAt} title={formatAbsolute(finding.lastSeenAt)}>
              {formatRelative(finding.lastSeenAt, now)}
            </time>
          </span>
        </p>

        <div>
          <button
            type="button"
            aria-expanded={evidenceOpen}
            onClick={() => setEvidenceOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", evidenceOpen && "rotate-180")}
              aria-hidden
            />
            Evidence ({finding.evidence.length})
          </button>
          {evidenceOpen && <EvidenceList evidence={finding.evidence} />}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
        <Button size="sm" onClick={() => copy.mutate()} disabled={copy.isPending}>
          {copy.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : copied ? (
            <Check />
          ) : (
            <Copy />
          )}
          {copy.isPending ? "Preparing" : copied ? "Copied" : "Copy fix prompt"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal />
          Adjust prompt
        </Button>
        {copy.isError && (
          <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
            {copy.error.message}
          </p>
        )}
      </footer>

      <FixPromptDialog finding={finding} open={adjustOpen} onOpenChange={setAdjustOpen} />
    </article>
  );
}

function EvidenceList({ evidence }: { evidence: FindingRow["evidence"] }) {
  if (evidence.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No evidence recorded.</p>;
  }

  return (
    <dl className="mt-2 grid gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-x-4">
      {evidence.map((item, index) => (
        <div key={`${item.label}-${index}`} className="contents">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 font-mono text-xs break-all whitespace-pre-wrap">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
