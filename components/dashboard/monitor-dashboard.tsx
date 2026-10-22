"use client";

import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, LoaderCircle, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { TeamSelector } from "@/components/team/team-selector";
import { cn } from "@/lib/utils";
import { checksQueryKey, fetchChecks, runCheck } from "./api";
import { CheckHistory } from "./check-history";
import { ErrorNotice } from "./badges";
import { FindingsList } from "./findings-list";
import { formatInterval, pluralize } from "./format";
import { useNow } from "./hooks";
import { OverviewCards } from "./overview-cards";
import type { RunCheckResponse } from "./types";

export function MonitorDashboard() {
  const queryClient = useQueryClient();
  const now = useNow();

  const checks = useQuery({
    queryKey: checksQueryKey,
    queryFn: fetchChecks,
    refetchInterval: 30_000,
  });

  const run = useMutation({
    mutationFn: runCheck,
    onSettled: () => queryClient.invalidateQueries({ queryKey: checksQueryKey }),
  });

  const data = checks.data;
  const interval = data?.overview.intervalMinutes ?? 60;

  const settingsButton = (
    <>
      <ThemeToggle />
      <SettingsDialog />
    </>
  );

  const settingsCta = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <SettingsDialog />
      <span>Open Settings to add your Liara token.</span>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-2">
            <TeamSelector />
            <div className="space-y-0.5">
              <h1 className="text-lg font-semibold tracking-tight">Project health</h1>
              <p className="text-sm text-muted-foreground">
                Tagged Liara resources are checked every {formatInterval(interval)}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" render={<Link href="/" />}>
              <ArrowLeft />
              Back to chat
            </Button>
            {settingsButton}
            <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <LoaderCircle className="animate-spin" /> : <Play />}
              {run.isPending ? "Checking" : "Run check now"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <RunMessage run={run} />

        {checks.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ErrorNotice
              message={checks.error.message}
              title="Could not load checks"
              className="w-full sm:w-auto sm:flex-1"
            />
            <Button variant="outline" size="sm" onClick={() => checks.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {data ? (
          <>
            <OverviewCards overview={data.overview} now={now} settingsAction={settingsCta} />
            <FindingsList
              findings={data.findings}
              tokenConfigured={data.overview.tokenConfigured}
              hasRuns={data.overview.lastRun !== null || data.runs.length > 0}
              now={now}
              settingsAction={settingsCta}
            />
            <CheckHistory runs={data.runs} now={now} />
          </>
        ) : checks.isPending ? (
          <DashboardSkeleton />
        ) : null}
      </main>
    </div>
  );
}

function RunMessage({ run }: { run: UseMutationResult<RunCheckResponse, Error, void> }) {
  if (run.isPending) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Checking projects. This can take up to a minute.
      </div>
    );
  }

  if (run.isError) {
    return <ErrorNotice message={run.error.message} title="Check failed" />;
  }

  if (!run.data) return null;

  const result = run.data;
  const projects = pluralize(result.projectsChecked, "project");

  if (result.status === "ok") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        Checked {projects}.
      </div>
    );
  }

  const message =
    result.error ??
    (result.status === "partial"
      ? `Checked ${projects} with some errors.`
      : result.status === "skipped"
        ? "Check was skipped."
        : "Check did not complete.");

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
        result.status === "partial"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-zinc-500/30 bg-muted text-muted-foreground",
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {result.status === "partial" && <p className="font-medium">Checked {projects}</p>}
        <p className="font-mono text-xs break-words whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading project health">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  );
}
