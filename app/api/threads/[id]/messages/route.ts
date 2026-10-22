import { currentTeamKey, getThread, listThreadMessages } from "@/lib/agent/threads-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  if (!(await getThread(id, await currentTeamKey()))) {
    return Response.json({ error: "Thread not found." }, { status: 404 });
  }
  return Response.json({ messages: await listThreadMessages(id) });
}
