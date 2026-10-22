import {
  createFolder,
  listFolders,
  normalizeFolderName,
  FOLDER_NAME_MAX_CHARS,
} from "@/lib/agent/folders-store";
import { currentTeamKey } from "@/lib/agent/threads-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ folders: await listFolders(await currentTeamKey()) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = normalizeFolderName(body?.name);
  if (!name) {
    return Response.json(
      { error: `Folder name must be 1–${FOLDER_NAME_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }
  const folder = await createFolder(await currentTeamKey(), name);
  if (!folder) {
    return Response.json({ error: "A folder with this name already exists." }, { status: 409 });
  }
  return Response.json({ folder }, { status: 201 });
}
