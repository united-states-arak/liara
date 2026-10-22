import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createLiaraClient, LiaraError, type LiaraClient } from "@/lib/liara/client";
import type { ResourceKind } from "@/lib/liara/services";
import type { LiaraProjectSummary } from "@/lib/liara/types";
import { redact } from "@/lib/redact";
import { liaraContext, type LiaraContext } from "@/lib/settings";
import { describeError } from "./errors";
import { loadTarget } from "./load";
import { teamScope } from "./queries";
import { RULES, type RuleFinding } from "./rules";
import { loadTaggedTargets, teamKeyOf, type CheckTarget } from "./targets";

const { checkRuns, findings } = schema;

export type CheckTrigger = "scheduled" | "manual";
export type CheckRunStatus = "ok" | "partial" | "failed" | "skipped";

export interface CheckRunResult {
  runId: string;
  status: CheckRunStatus;
  projectsChecked: number;
  /** Run failures only. Also stored in check_runs.error. */
  error?: string;
}

type Db = Awaited<ReturnType<typeof getDb>>;
type FindingRow = typeof findings.$inferSelect;
type Outcome = { status: CheckRunStatus; projectsChecked: number; error?: string };

const MAX_ERROR_CHARS = 1000;
const MAX_EVIDENCE_VALUE_CHARS = 500;

// Findings written before resource kinds existed use these app rule ids.
const LEGACY_APP_RULE_IDS: ReadonlyMap<string, string> = new Map([
  ["project-not-deployed", "app-not-deployed"],
  ["release-failed", "app-release-failed"],
  ["log-errors", "app-log-errors"],
  ["resource-usage", "app-resource-usage"],
]);

export function fingerprintOf(
  kind: ResourceKind,
  resourceId: string,
  ruleId: string,
  teamId: string | null = null,
): string {
  // Personal-account fingerprints omit the team segment.
  const parts = [kind, resourceId, ruleId];
  if (teamId) parts.unshift("team", teamId);
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function resourceKey(kind: ResourceKind, resourceId: string | null): string {
  return `${kind}\u001f${resourceId ?? ""}`;
}

const globalForRuns = globalThis as unknown as {
  __starcoachCheckRun?: Promise<CheckRunResult>;
};

/**
 * Each run covers the selected team's tagged resources with monitored=true, across all kinds.
 * If nothing is tagged, it falls back to every app in the team. Scheduled and manual runs share
 * this logic. Concurrent calls share the in-flight run, so the trigger of the first call wins.
 */
export function runChecks(trigger: CheckTrigger): Promise<CheckRunResult> {
  if (!globalForRuns.__starcoachCheckRun) {
    const run = executeRun(trigger).finally(() => {
      globalForRuns.__starcoachCheckRun = undefined;
    });
    globalForRuns.__starcoachCheckRun = run;
  }
  return globalForRuns.__starcoachCheckRun;
}

async function executeRun(trigger: CheckTrigger): Promise<CheckRunResult> {
  const runId = randomUUID();

  let ctx: LiaraContext | null;
  try {
    ctx = await liaraContext();
    const db = await getDb();
    await db.insert(checkRuns).values({
      id: runId,
      teamId: ctx?.teamId ?? null,
      trigger,
      status: "running",
      startedAt: new Date(),
      projectsChecked: 0,
    });
  } catch (error) {
    console.error("[checks] could not record run start:", describeError(error));
    return {
      runId,
      status: "failed",
      projectsChecked: 0,
      error: "Could not write to the database",
    };
  }

  const outcome = await performChecks(runId, ctx).catch((error: unknown): Outcome => ({
    status: "failed",
    projectsChecked: 0,
    error: `Check run aborted: ${describeError(error)}`,
  }));
  const error = outcome.error?.slice(0, MAX_ERROR_CHARS);

  try {
    const db = await getDb();
    await db
      .update(checkRuns)
      .set({
        status: outcome.status,
        error: error ?? null,
        projectsChecked: outcome.projectsChecked,
        finishedAt: new Date(),
      })
      .where(eq(checkRuns.id, runId));
  } catch (dbError) {
    console.error("[checks] could not record run result:", describeError(dbError));
  }

  return {
    runId,
    status: outcome.status,
    projectsChecked: outcome.projectsChecked,
    error,
  };
}

async function performChecks(runId: string, ctx: LiaraContext | null): Promise<Outcome> {
  if (!ctx) {
    return {
      status: "skipped",
      projectsChecked: 0,
      error: "No Liara token configured",
    };
  }

  const teamId = ctx.teamId;
  const client = createLiaraClient(ctx.token, { teamId: teamId ?? undefined });
  let targets: CheckTarget[];
  try {
    targets = await selectTargets(client, teamId);
  } catch (error) {
    return failureOutcome(error, 0, "Could not list monitored resources");
  }

  for (const rule of RULES) {
    if (rule.skipReason) console.debug(`[checks] rule ${rule.id} skipped: ${rule.skipReason}`);
  }

  const db = await getDb();
  const existing = new Map<string, FindingRow>();
  for (const row of await db.select().from(findings).where(teamScope(findings.teamId, teamId))) {
    const adopted = adoptLegacyRow(row, teamId);
    existing.set(adopted.fingerprint, adopted);
  }

  const now = new Date();
  const produced = new Set<string>();
  const checked = new Map<string, Set<string>>();
  const notes: string[] = [];
  let resourcesChecked = 0;
  let incomplete = false;

  try {
    for (const target of targets) {
      const loaded = await loadTarget(client, ctx, target);
      if (!loaded) {
        console.debug(
          `[checks] ${target.kind} "${target.name}" skipped: no documented health endpoint`,
        );
        continue;
      }

      const ruleIds = new Set<string>();
      for (const rule of RULES) {
        if (rule.kind !== target.kind || rule.skipReason) continue;
        if (!rule.requires.every((source) => loaded.available.has(source))) continue;
        ruleIds.add(rule.id);
        for (const finding of rule.evaluate(loaded.snapshot)) {
          const values = toFindingValues(finding, target, loaded.secrets, teamId);
          if (produced.has(values.fingerprint)) continue;
          produced.add(values.fingerprint);
          await upsertFinding(db, existing, values, runId, now);
        }
      }

      if (loaded.failures.length > 0) {
        incomplete = true;
        notes.push(...loaded.failures.map((failure) => `${target.name}: ${failure}`));
      } else {
        checked.set(resourceKey(target.kind, target.resourceId), ruleIds);
        resourcesChecked++;
      }
    }
  } catch (error) {
    return failureOutcome(error, resourcesChecked, "Check run aborted");
  }

  // A finding resolves only when its resource was fully checked this run and its rule ran.
  const toResolve: string[] = [];
  for (const row of existing.values()) {
    if (row.status === "resolved" || produced.has(row.fingerprint)) continue;
    if (checked.get(resourceKey(row.kind, row.resourceId))?.has(row.ruleId)) {
      toResolve.push(row.id);
    }
  }
  if (toResolve.length > 0) {
    await db
      .update(findings)
      .set({ status: "resolved", resolvedAt: now, lastRunId: runId })
      .where(inArray(findings.id, toResolve));
  }

  return {
    status: incomplete ? "partial" : "ok",
    projectsChecked: resourcesChecked,
    error: notes.length > 0 ? notes.join("; ") : undefined,
  };
}

async function selectTargets(client: LiaraClient, teamId: string | null): Promise<CheckTarget[]> {
  const tagged = await loadTaggedTargets(teamId);
  if (tagged.length > 0) return tagged;

  console.debug(`[checks] no resource tags set for ${teamKeyOf(teamId)}; checking all apps`);
  const { projects } = await client.listProjects();
  return (projects ?? []).map((project: LiaraProjectSummary): CheckTarget => ({
    kind: "app",
    resourceId: project.project_id,
    name: project.project_id,
  }));
}

/** Findings from before resource kinds have no resourceId. Re-key them so they update in place. */
function adoptLegacyRow(row: FindingRow, teamId: string | null): FindingRow {
  if (row.resourceId !== null) return row;
  const ruleId = LEGACY_APP_RULE_IDS.get(row.ruleId) ?? row.ruleId;
  const resourceId = row.projectName;
  return {
    ...row,
    kind: "app",
    ruleId,
    resourceId,
    fingerprint: fingerprintOf("app", resourceId, ruleId, teamId),
  };
}

function toFindingValues(
  finding: RuleFinding,
  target: CheckTarget,
  secrets: string[],
  teamId: string | null,
) {
  const scrub = (value: string) => redact(value, secrets);
  return {
    teamId,
    fingerprint: fingerprintOf(target.kind, target.resourceId, finding.ruleId, teamId),
    ruleId: finding.ruleId,
    kind: target.kind,
    resourceId: target.resourceId,
    projectName: target.name,
    serviceName: finding.serviceName,
    severity: finding.severity,
    title: scrub(finding.title),
    summary: scrub(finding.summary),
    evidence: finding.evidence.map(({ label, value }) => ({
      label: scrub(label),
      value: scrub(value).slice(0, MAX_EVIDENCE_VALUE_CHARS),
    })),
  };
}

type FindingValues = ReturnType<typeof toFindingValues>;

async function upsertFinding(
  db: Db,
  existing: Map<string, FindingRow>,
  values: FindingValues,
  runId: string,
  now: Date,
) {
  const prior = existing.get(values.fingerprint);

  if (!prior) {
    const row: FindingRow = {
      id: randomUUID(),
      ...values,
      status: "new",
      firstSeenAt: now,
      lastSeenAt: now,
      resolvedAt: null,
      lastRunId: runId,
    };
    await db.insert(findings).values(row);
    existing.set(values.fingerprint, row);
    return;
  }

  await db
    .update(findings)
    .set({
      ...values,
      status: "ongoing",
      lastSeenAt: now,
      resolvedAt: null,
      lastRunId: runId,
    })
    .where(eq(findings.id, prior.id));
  existing.set(values.fingerprint, {
    ...prior,
    ...values,
    status: "ongoing",
    lastSeenAt: now,
    resolvedAt: null,
    lastRunId: runId,
  });
}

function failureOutcome(error: unknown, projectsChecked: number, context: string): Outcome {
  if (error instanceof LiaraError) {
    if (error.kind === "auth") {
      return {
        status: "failed",
        projectsChecked,
        error: "Liara token is invalid or expired",
      };
    }
    if (error.kind === "rate_limited") {
      return {
        status: "failed",
        projectsChecked,
        error: "Liara rate limit reached, retry later",
      };
    }
  }
  return {
    status: "failed",
    projectsChecked,
    error: `${context}: ${describeError(error)}`,
  };
}
