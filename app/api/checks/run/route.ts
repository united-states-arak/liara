import { runChecks } from "@/lib/checker/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const result = await runChecks("manual");
  return Response.json(result);
}
