import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getLiaraToken, getSelectedTeamId } from "@/lib/settings";
import { CHECK_INTERVAL_MS, STALE_RUN_MS, schedulerState, type SchedulerState } from "./schedule";
import { loadTaggedTargets, type CheckTarget } from "./targets";

const { checkRuns, findings } = schema;

export type FindingRow = typeof findings.$inferSelect;
export type CheckRunRow = typeof checkRuns.$inferSelect;
export type FindingSeverity = FindingRow["severity"];


/** Rows for one Liara team, or for the personal account when teamId is null. */
export function teamScope(
  column: typeof findings.teamId | typeof checkRuns.teamId,
  teamId: string | null,
): SQL {
  return teamId ? eq(column, teamId) : isNull(column);
}

/**
 * Findings of tagged resources. With no tags, every finding of the team is in scope,
 * matching the fallback in run.ts.
 */
function monitoredScope(targets: readonly CheckTarget[]): SQL | undefined {
  if (targets.length === 0) return undefined;
  return or(
    ...targets.map((target) =>
      and(eq(findings.kind, target.kind), eq(findings.resourceId, target.resourceId)),
    ),
    // Legacy app findings have no resourceId yet and are keyed by project name.
    ...targets
      .filter((target) => target.kind === "app")
      .map((target) =>
        and(isNull(findings.resourceId), eq(findings.projectName, target.resourceId)),
      ),
  );
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface ScheduleStatus {
  intervalMs: number;
  /** Start of the team's latest scheduled run, or null if it never had one. */
  lastScheduledAt: Date | null;
  /** lastScheduledAt + interval. Null when there is no scheduled run yet. May be in the past. */
  nextRunAt: Date | null;
  /** The next run is due now, so the scheduler (if running) starts one on its next tick. */
  due: boolean;
  /** A run (manual or scheduled) is in flight, so nothing else is due. */
  running: boolean;
}

export interface CheckOverview {
  lastRun: CheckRunRow | null;
  /** Null until the team has had a scheduled run. May be in the past (overdue). */
  nextRunAt: Date | null;
  intervalMinutes: number;
  schedule: ScheduleStatus & { scheduler: SchedulerState };
  activeFindingCounts: Record<FindingSeverity, number>;
  tokenConfigured: boolean;
  /** Number of resources with monitored tags. Zero means the run falls back to all apps. */
  taggedCount: number;
}

export async function listFindings(
  options: { includeResolved?: boolean } = {},
): Promise<FindingRow[]> {
  const db = await getDb();
  const teamId = await getSelectedTeamId();
  const monitored = await loadTaggedTargets(teamId);
  const rows = await db
    .select()
    .from(findings)
    .where(
      and(
        teamScope(findings.teamId, teamId),
        monitoredScope(monitored),
        options.includeResolved ? undefined : ne(findings.status, "resolved"),
      ),
    );

  return rows.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );
}

export async function getFinding(id: string): Promise<FindingRow | null> {
  const db = await getDb();
  const rows = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listRuns(limit = 20): Promise<CheckRunRow[]> {
  const db = await getDb();
  const teamId = await getSelectedTeamId();
  return db
    .select()
    .from(checkRuns)
    .where(teamScope(checkRuns.teamId, teamId))
    .orderBy(desc(checkRuns.startedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/**
 * The hourly schedule is anchored on the team's latest *scheduled* run (by start time, whatever
 * its outcome, so a failing Liara API is retried hourly, not every tick). Manual runs
 * deliberately do not move it: "Run check now" is an extra look, and the cadence stays on its
 * original hourly grid. A team with no scheduled run is due immediately, which also covers
 * the first run after startup.
 */
export async function getScheduleStatus(teamId: string | null): Promise<ScheduleStatus> {
  const db = await getDb();
  const [lastScheduled] = await db
    .select({ startedAt: checkRuns.startedAt })
    .from(checkRuns)
    .where(and(eq(checkRuns.trigger, "scheduled"), teamScope(checkRuns.teamId, teamId)))
    .orderBy(desc(checkRuns.startedAt))
    .limit(1);
  const [inFlight] = await db
    .select({ startedAt: checkRuns.startedAt })
    .from(checkRuns)
    .where(and(eq(checkRuns.status, "running"), teamScope(checkRuns.teamId, teamId)))
    .orderBy(desc(checkRuns.startedAt))
    .limit(1);

  const now = Date.now();
  const lastScheduledAt = lastScheduled?.startedAt ?? null;
  const nextRunAt = lastScheduledAt ? new Date(lastScheduledAt.getTime() + CHECK_INTERVAL_MS) : null;
  const running = inFlight !== undefined && now - inFlight.startedAt.getTime() < STALE_RUN_MS;
  return {
    intervalMs: CHECK_INTERVAL_MS,
    lastScheduledAt,
    nextRunAt,
    due: !running && (nextRunAt === null || nextRunAt.getTime() <= now),
    running,
  };
}

export async function getCheckOverview(): Promise<CheckOverview> {
  const db = await getDb();
  const teamId = await getSelectedTeamId();
  const monitored = await loadTaggedTargets(teamId);

  const [lastRun] = await db
    .select()
    .from(checkRuns)
    .where(teamScope(checkRuns.teamId, teamId))
    .orderBy(desc(checkRuns.startedAt))
    .limit(1);

  const schedule = await getScheduleStatus(teamId);

  const countRows = await db
    .select({
      severity: findings.severity,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(findings)
    .where(
      and(
        ne(findings.status, "resolved"),
        teamScope(findings.teamId, teamId),
        monitoredScope(monitored),
      ),
    )
    .groupBy(findings.severity);

  const activeFindingCounts: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const row of countRows) {
    activeFindingCounts[row.severity] = row.count;
  }

  return {
    lastRun: lastRun ?? null,
    nextRunAt: schedule.nextRunAt,
    intervalMinutes: CHECK_INTERVAL_MS / 60_000,
    schedule: { ...schedule, scheduler: schedulerState() },
    activeFindingCounts,
    tokenConfigured: (await getLiaraToken()) !== null,
    taggedCount: monitored.length,
  };
}
