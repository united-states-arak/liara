import { createHash, timingSafeEqual } from "node:crypto";
import { runChecks } from "@/lib/checker/run";

export const maxDuration = 60;

// External cron must POST with `Authorization: Bearer $CRON_SECRET`.
// GET is intentionally not exported, so it returns 405.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runChecks("scheduled");
  return Response.json(result);
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = digest(`Bearer ${secret}`);
  const provided = digest(request.headers.get("authorization") ?? "");
  return timingSafeEqual(expected, provided);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
