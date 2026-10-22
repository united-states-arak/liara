import { liaraContext } from "@/lib/settings";
import { getScheduleStatus } from "./queries";
import { runChecks } from "./run";
import { CHECK_INTERVAL_MS, schedulerState } from "./schedule";

// In-process timer for long-running Node servers. Serverless deployments cannot keep a
// timer alive, so they call POST /api/cron/check from external cron.
//
// The timer does not run every interval. It polls every few seconds and starts a run when the
// selected team's schedule says one is due (last scheduled run + interval, or no scheduled run
// yet). This makes a restart, a team switch, or a missed hour recover on its own, instead of
// restarting a full-interval countdown that never fires on a frequently restarted dev server.
const STARTUP_DELAY_MS = 5_000;
const TICK_MS = Math.min(30_000, Math.max(1_000, Math.floor(CHECK_INTERVAL_MS / 4)));

const globalForScheduler = globalThis as unknown as {
  __starcoachScheduler?: NodeJS.Timeout;
  __starcoachTicking?: boolean;
};

async function tick(): Promise<void> {
  if (globalForScheduler.__starcoachTicking) return;
  globalForScheduler.__starcoachTicking = true;
  try {
    schedulerState().lastTickAt = Date.now();
    const ctx = await liaraContext();
    if (!ctx) return;
    const schedule = await getScheduleStatus(ctx.teamId);
    if (!schedule.due) return;
    console.info(
      `[checks] scheduled run due for team ${ctx.teamId ?? "personal"} ` +
        `(last scheduled run: ${schedule.lastScheduledAt?.toISOString() ?? "never"})`,
    );
    const result = await runChecks("scheduled");
    console.info(`[checks] scheduled run finished: ${result.status}`);
  } catch (error) {
    console.error("[checks] scheduled run failed:", error);
  } finally {
    globalForScheduler.__starcoachTicking = false;
  }
}

export function ensureScheduler(): void {
  if (globalForScheduler.__starcoachScheduler) return;

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  globalForScheduler.__starcoachScheduler = timer;
  Object.assign(schedulerState(), { status: "running", reason: null, startedAt: Date.now() });

  setTimeout(() => void tick(), STARTUP_DELAY_MS).unref();
}
