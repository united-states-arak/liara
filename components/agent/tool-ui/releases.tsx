"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { GitBranch, GitCommitHorizontal, Globe } from "lucide-react";
import {
  isToolError,
  type ListReleasesResult,
  type ReleaseResult,
} from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";
import { formatTime, Pill, ToolCard, ToolError, ToolRunning, toneForState, type Tone } from "./shared";

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  info: "bg-sky-500",
};

function isCurrent(release: ReleaseResult, current: string | undefined): boolean {
  return Boolean(current) && (release.id === current || release.tag === current);
}

export const DeploymentStateToolUI: ToolCallMessagePartComponent<unknown, ListReleasesResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading releases…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard
      slot="agent-deployment-state"
      title={`Releases · ${result.name}`}
      subtitle={[
        result.currentRelease ? `Current: ${result.currentRelease}` : null,
        result.total !== undefined ? `${result.total} total` : null,
        "newest first",
      ]
        .filter(Boolean)
        .join(" · ")}
      icon={Globe}
    >
      {result.releases.length === 0 ? (
        <p className="text-muted-foreground text-sm">No releases returned.</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="relative w-max min-w-full">
            <div aria-hidden className="bg-border absolute inset-x-0 top-[0.4rem] h-px" />
            <ol className="relative flex gap-3">
            {result.releases.map((release, index) => {
              const tone = toneForState(release.state);
              const current = isCurrent(release, result.currentRelease);
              return (
                <li
                  key={release.id ?? index}
                  data-current={current || undefined}
                  className="relative flex w-56 shrink-0 flex-col gap-1.5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "ring-card size-2.5 rounded-full ring-4",
                      DOT_CLASS[tone],
                    )}
                  />
                  <div
                    className={cn(
                      "bg-background flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border p-2.5",
                      current && "border-primary/60 ring-primary/30 ring-1",
                    )}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Pill tone={tone}>{release.state ?? "unknown"}</Pill>
                      {current ? <Pill tone="info">Current</Pill> : null}
                    </div>
                    {release.tag ? (
                      <code className="text-muted-foreground truncate font-mono text-xs">
                        {release.tag}
                      </code>
                    ) : null}
                    {release.commitMessage ? (
                      <p className="line-clamp-2 text-sm break-words">{release.commitMessage}</p>
                    ) : null}
                    <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      {release.commit ? (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <GitCommitHorizontal className="size-3" aria-hidden />
                          {release.commit.slice(0, 7)}
                        </span>
                      ) : null}
                      {release.branch ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <GitBranch className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{release.branch}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatTime(release.createdAt) ?? "time unknown"}
                    </p>
                  </div>
                </li>
              );
            })}
            </ol>
          </div>
        </div>
      )}
    </ToolCard>
  );
};
