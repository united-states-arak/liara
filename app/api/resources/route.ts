import { NextResponse } from "next/server";
import { getInventory, teamKeyOf } from "@/lib/liara/inventory";
import { legacySections, type ResourcesResponse } from "@/lib/liara/resources";
import { listTags } from "@/lib/liara/tags";
import { liaraContext } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await liaraContext();
    if (!ctx) {
      return NextResponse.json({ connected: false } satisfies ResourcesResponse);
    }
    const teamKey = teamKeyOf(ctx.teamId);
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const [inventory, tags] = await Promise.all([
      getInventory(teamKey, { refresh }),
      listTags(teamKey),
    ]);
    return NextResponse.json({
      connected: true,
      inventory,
      tags,
      ...legacySections(inventory),
    } satisfies ResourcesResponse);
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
