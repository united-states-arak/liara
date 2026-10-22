import type { ReactNode } from "react";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  Clock,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorNotice, RunStatusBadge, SEVERITY_META, TriggerBadge } from "./badges";
import { formatAbsolute, formatClock, formatInterval, formatRelative, pluralize } from "./format";
import { SEVERITIES, type ChecksOverview } from "./types";

type Health = {
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
};

function deriveHealth(overview: ChecksOverview): Health {
  const counts = overview.activeFindingCounts;
  const urgent = counts.critical + counts.high;
  const warnings = counts.medium + counts.low;

  if (!overview.tokenConfigured) {
    return {
      label: "Not connected",
      description: "Connect your Liara account to start monitoring.",
      icon: CircleDashed,
      tone: "text-muted-foreground",
    };
  }
  if (urgent > 0) {
    return {
      label: "Needs attention",
      description: `${pluralize(urgent, "critical or high finding")} open.`,
      icon: ShieldAlert,
      tone: "text-red-600 dark:text-red-400",
    };
  }
  if (overview.lastRun?.status === "failed") {
    return {
      label: "Last check failed",
      description: "Findings may be out of date until the next check succeeds.",
      icon: ShieldAlert,
      tone: "text-red-600 dark:text-red-400",
    };
  }
  if (warnings > 0) {
    return {
      label: "Warnings",
      description: `${pluralize(warnings, "medium or low finding")} open.`,
      icon: TriangleAlert,
      tone: "text-amber-600 dark:text-amber-400",
    };
  }
  if (!overview.lastRun) {
    return {
      label: "Waiting for first check",
      description: "Run a check to scan your projects.",
      icon: CircleDashed,
      tone: "text-muted-foreground",
    };
  }
  return {
    label: "Healthy",
    description: "No medium, high, or critical findings are open.",
    icon: CircleCheck,
    tone: "text-emerald-600 dark:text-emerald-400",
  };
}

function describeNextRun(overview: ChecksOverview, now: number) {
  const { schedule } = overview;
  const { scheduler } = schedule;
  const schedulerLabel =
    scheduler.status === "running"
      ? "Scheduler enabled"
      : scheduler.status === "disabled"
        ? `Scheduler disabled: ${scheduler.reason ?? "unknown reason"}`
        : `Scheduler not running: ${scheduler.reason ?? "unknown reason"}`;
  const runs = scheduler.status === "running";

  let headline: string;
  let detail: string | null = null;
  let tone = "";

  if (schedule.running) {
    headline = "Running now";
  } else if (!schedule.nextRunAt) {
    headline = runs ? "First run starting shortly" : "No scheduled run yet";
    detail = runs ? "No scheduled check has run for this team." : null;
  } else {
    const at = Date.parse(schedule.nextRunAt);
    if (at > now) {
      headline = `${formatClock(schedule.nextRunAt)}, ${formatRelative(schedule.nextRunAt, now)}`;
      detail = `Last scheduled run ${formatRelative(schedule.lastScheduledAt ?? schedule.nextRunAt, now)}.`;
    } else {
      headline = runs ? "Overdue, running now" : "Overdue";
      tone = runs ? "" : "text-amber-600 dark:text-amber-400";
      detail = `Was due ${formatClock(schedule.nextRunAt)} (${formatRelative(schedule.nextRunAt, now)}).`;
    }
  }
  return { headline, detail, tone, scheduler: schedulerLabel };
}

function Card({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function OverviewCards({
  overview,
  now,
  settingsAction,
}: {
  overview: ChecksOverview;
  now: number;
  settingsAction?: ReactNode;
}) {
  const health = deriveHealth(overview);
  const HealthIcon = health.icon;
  const lastRun = overview.lastRun;
  const counts = overview.activeFindingCounts;
  const total = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);

  const next = describeNextRun(overview, now);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Health" icon={HealthIcon}>
          <div className="flex items-start gap-3">
            <HealthIcon className={cn("mt-0.5 size-6 shrink-0", health.tone)} aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className={cn("text-xl font-semibold tracking-tight", health.tone)}>
                {health.label}
              </p>
              <p className="text-sm text-muted-foreground">{health.description}</p>
            </div>
          </div>
          {lastRun?.status === "failed" && lastRun.error && (
            <ErrorNotice message={lastRun.error} title="Last check failed" />
          )}
          {!overview.tokenConfigured && settingsAction}
        </Card>

        <Card title="Last run" icon={Clock}>
          {lastRun ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <RunStatusBadge status={lastRun.status} />
                <TriggerBadge trigger={lastRun.trigger} />
              </div>
              <p className="text-sm font-medium">
                <time dateTime={lastRun.startedAt} title={formatAbsolute(lastRun.startedAt)}>
                  {formatRelative(lastRun.startedAt, now)}
                </time>
              </p>
              <p className="text-sm text-muted-foreground">
                {pluralize(lastRun.projectsChecked, "project")} checked
              </p>
              {lastRun.status !== "failed" && lastRun.error && (
                <p className="text-xs break-words text-muted-foreground">{lastRun.error}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No checks have run yet.</p>
          )}
        </Card>

        <Card title="Next run" icon={CalendarClock}>
          {overview.tokenConfigured ? (
            <div className="space-y-2">
              <p className={cn("text-xl font-semibold tracking-tight", next.tone)}>{next.headline}</p>
              {next.detail && <p className="text-sm text-muted-foreground">{next.detail}</p>}
              <p className="text-xs text-muted-foreground">
                Every {formatInterval(overview.intervalMinutes)} · {next.scheduler}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Scheduled checks start once Liara is connected.
            </p>
          )}
        </Card>
      </div>

      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Open findings by severity
          </h2>
          <p className="text-xs text-muted-foreground">{pluralize(total, "open finding")}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SEVERITIES.map((severity) => (
            <div
              key={severity}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
            >
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn("size-2 rounded-full", SEVERITY_META[severity].dot)}
                  aria-hidden
                />
                {SEVERITY_META[severity].label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{counts[severity]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
