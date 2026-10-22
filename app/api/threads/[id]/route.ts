import { resolveFolderRef } from "@/lib/agent/folders-store";
import {
  currentTeamKey,
  deleteThread,
  getThread,
  updateThread,
  type ThreadPatch,
} from "@/lib/agent/threads-store";

export const dynamic = "force-dynamic";

const TITLE_MAX_CHARS = 200;

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  const thread = await getThread(id, await currentTeamKey());
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 });
  return Response.json(thread);
}

export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  const teamKey = await currentTeamKey();
  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    status?: unknown;
    folderId?: unknown;
  } | null;

  const patch: ThreadPatch = {};
  if (typeof body?.title === "string") {
    const title = body.title.trim().slice(0, TITLE_MAX_CHARS);
    patch.title = title.length > 0 ? title : null;
  }
  if (body?.status === "regular" || body?.status === "archived") {
    patch.status = body.status;
  }
  if (body?.folderId !== undefined) {
    const folder = await resolveFolderRef(body.folderId, teamKey);
    if ("error" in folder) return Response.json({ error: folder.error }, { status: 400 });
    patch.folderId = folder.folderId;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await updateThread(id, teamKey, patch);
  if (!updated) return Response.json({ error: "Thread not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  const deleted = await deleteThread(id, await currentTeamKey());
  if (!deleted) return Response.json({ error: "Thread not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
