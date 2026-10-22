import { getCheckOverview, listFindings, listRuns } from "@/lib/checker/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [overview, findings, runs] = await Promise.all([
    getCheckOverview(),
    listFindings(),
    listRuns(20),
  ]);
  return Response.json({ overview, findings, runs });
}
