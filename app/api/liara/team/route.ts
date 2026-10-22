import { NextResponse } from "next/server";
import { createLiaraClient, describeLiaraError } from "@/lib/liara/client";
import { getLiaraToken, setSelectedTeamId, SettingsValidationError } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || !("teamId" in body)) {
      return NextResponse.json({ error: "teamId must be a string or null." }, { status: 400 });
    }
    const { teamId } = body;
    if (teamId !== null && typeof teamId !== "string") {
      return NextResponse.json({ error: "teamId must be a string or null." }, { status: 400 });
    }

    const selectedTeamId = teamId?.trim() || null;
    if (selectedTeamId) {
      const token = await getLiaraToken();
      if (!token) {
        return NextResponse.json(
          { error: "No Liara token is set. Add one in Settings." },
          { status: 400 },
        );
      }

      let teams;
      try {
        teams = await createLiaraClient(token).listTeams();
      } catch (error) {
        return NextResponse.json({ error: describeLiaraError(error) }, { status: 502 });
      }
      if (!teams.some((team) => team.id === selectedTeamId)) {
        return NextResponse.json(
          { error: "That team is not available for this Liara account." },
          { status: 400 },
        );
      }
    }

    await setSelectedTeamId(selectedTeamId);
    return NextResponse.json({ selectedTeamId });
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("liara/team failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
