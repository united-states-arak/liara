import { NextResponse } from "next/server";
import { teamKeyOf } from "@/lib/liara/inventory";
import { setMonitored } from "@/lib/liara/tags";
import { getSelectedTeamId } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const value: unknown = await request.json().catch(() => null);
    const monitored =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>).monitored
        : undefined;
    if (typeof monitored !== "boolean") {
      return NextResponse.json({ error: "monitored must be a boolean." }, { status: 400 });
    }

    const teamKey = teamKeyOf(await getSelectedTeamId());
    const tag = await setMonitored(id, monitored, teamKey);
    if (!tag) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }
    return NextResponse.json(tag);
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
