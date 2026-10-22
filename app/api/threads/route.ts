import { resolveFolderRef } from "@/lib/agent/folders-store";
import { createThread, currentTeamKey, listThreads } from "@/lib/agent/threads-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ threads: await listThreads(await currentTeamKey()) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { folderId?: unknown } | null;
  const teamKey = await currentTeamKey();
  const folder = await resolveFolderRef(body?.folderId ?? null, teamKey);
  if ("error" in folder) return Response.json({ error: folder.error }, { status: 400 });
  const id = await createThread(teamKey, folder.folderId);
  return Response.json({ id }, { status: 201 });
}
