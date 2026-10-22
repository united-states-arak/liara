const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1000;

function readIntervalMs(): number {
  const raw = Number(process.env.CHECK_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= MIN_INTERVAL_MS ? Math.floor(raw) : DEFAULT_INTERVAL_MS;
}

/** Time between scheduled runs. CHECK_INTERVAL_MS overrides the hourly default (testing only). */
export const CHECK_INTERVAL_MS = readIntervalMs();

/** A "running" row older than this belongs to a crashed process and no longer blocks runs. */
export const STALE_RUN_MS = 15 * 60 * 1000;

export type SchedulerStatus = "running" | "disabled" | "not-started";

export interface SchedulerState {
  status: SchedulerStatus;
  /** Why the scheduler is not running here. */
  reason: string | null;
  startedAt: number | null;
  lastTickAt: number | null;
}

// Shared through globalThis because instrumentation and route handlers are bundled separately.
const globalForState = globalThis as unknown as { __starcoachSchedulerState?: SchedulerState };

export function schedulerState(): SchedulerState {
  globalForState.__starcoachSchedulerState ??= {
    status: "not-started",
    reason:
      "The in-process scheduler has not started in this server. Scheduled runs need an external POST to /api/cron/check.",
    startedAt: null,
    lastTickAt: null,
  };
  return globalForState.__starcoachSchedulerState;
}

export function disableScheduler(reason: string): void {
  Object.assign(schedulerState(), { status: "disabled", reason });
}
