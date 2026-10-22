import { NextResponse } from "next/server";
import { createLiaraClient, describeLiaraError } from "@/lib/liara/client";
import type { LiaraTeam } from "@/lib/liara/types";
import { getLiaraToken, getSelectedTeamId } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Personal = { name: string; email: string } | null;

type TeamsResponse = {
  teams: LiaraTeam[];
  selectedTeamId: string | null;
  personal: Personal;
  error?: string;
};

function readPersonal(me: unknown): Personal {
  if (typeof me !== "object" || me === null || !("user" in me)) return null;
  const user = me.user;
  if (typeof user !== "object" || user === null) return null;
  const fullname = "fullname" in user && typeof user.fullname === "string" ? user.fullname : "";
  const email = "email" in user && typeof user.email === "string" ? user.email : "";
  if (!fullname && !email) return null;
  return { name: fullname || email, email };
}

export async function GET() {
  try {
    const [token, selectedTeamId] = await Promise.all([getLiaraToken(), getSelectedTeamId()]);
    if (!token) {
      const body: TeamsResponse = {
        teams: [],
        selectedTeamId,
        personal: null,
        error: "No Liara token is set. Add one in Settings.",
      };
      return NextResponse.json(body);
    }

    const client = createLiaraClient(token);
    const [me, teams] = await Promise.allSettled([client.me(), client.listTeams()]);

    const failure = [me, teams].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const body: TeamsResponse = {
      teams: teams.status === "fulfilled" ? teams.value : [],
      selectedTeamId,
      personal: me.status === "fulfilled" ? readPersonal(me.value) : null,
      ...(failure && { error: describeLiaraError(failure.reason) }),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("liara/teams failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
