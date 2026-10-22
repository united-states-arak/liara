import { getFinding } from "@/lib/checker/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const finding = await getFinding(id);
  if (!finding) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }
  return Response.json(finding);
}
