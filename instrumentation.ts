export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.SCHEDULER_ENABLED === "false") {
    const { disableScheduler } = await import("./lib/checker/schedule");
    disableScheduler("Disabled by SCHEDULER_ENABLED=false");
    return;
  }

  const { ensureScheduler } = await import("./lib/checker/scheduler");
  ensureScheduler();
}
