import {
  deleteFolder,
  FOLDER_NAME_MAX_CHARS,
  normalizeFolderName,
  renameFolder,
} from "@/lib/agent/folders-store";
import { currentTeamKey } from "@/lib/agent/threads-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = normalizeFolderName(body?.name);
  if (!name) {
    return Response.json(
      { error: `Folder name must be 1–${FOLDER_NAME_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }
  const result = await renameFolder(id, await currentTeamKey(), name);
  if (result.status === "not_found") {
    return Response.json({ error: "Folder not found." }, { status: 404 });
  }
  if (result.status === "duplicate") {
    return Response.json({ error: "A folder with this name already exists." }, { status: 409 });
  }
  return Response.json({ folder: result.folder });
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  const deleted = await deleteFolder(id, await currentTeamKey());
  if (!deleted) return Response.json({ error: "Folder not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
