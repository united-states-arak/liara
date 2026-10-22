import { Activity, ChevronDown } from "lucide-react";
import { ErrorNotice, RunStatusBadge, TriggerBadge } from "./badges";
import { formatAbsolute, formatRelative, pluralize } from "./format";
import type { RunRow, RunStatus } from "./types";

const ERROR_TITLES: Partial<Record<RunStatus, string>> = {
  failed: "Check failed",
  partial: "Completed with errors",
};

export function CheckHistory({ runs, now }: { runs: RunRow[]; now: number }) {
  return (
    <details open className="group rounded-lg border bg-card text-card-foreground">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 py-3 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-muted-foreground" aria-hidden />
          Check history
          <span className="font-normal text-muted-foreground">
            ({pluralize(runs.length, "run")})
          </span>
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      {runs.length === 0 ? (
        <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
          No check runs yet.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {runs.map((run) => (
            <li key={run.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <time
                  dateTime={run.startedAt}
                  title={formatAbsolute(run.startedAt)}
                  className="text-sm font-medium"
                >
                  {formatAbsolute(run.startedAt)}
                </time>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(run.startedAt, now)}
                </span>
                <TriggerBadge trigger={run.trigger} />
                <RunStatusBadge status={run.status} />
                <span className="text-xs text-muted-foreground">
                  {pluralize(run.projectsChecked, "project")} checked
                </span>
              </div>
              {run.error && (run.status === "failed" || run.status === "partial") && (
                <ErrorNotice message={run.error} title={ERROR_TITLES[run.status]} />
              )}
              {run.error && run.status === "skipped" && (
                <p className="text-xs text-muted-foreground">{run.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
