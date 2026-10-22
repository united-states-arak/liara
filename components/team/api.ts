import { requestJson } from "@/components/settings/settings-api";
import type { LiaraTeam } from "@/lib/liara/types";

export type TeamsResponse = {
  teams: LiaraTeam[];
  selectedTeamId: string | null;
  personal: { name: string; email: string } | null;
  error?: string;
};

export const TEAMS_QUERY_KEY = ["liara", "teams"] as const;

export function fetchTeams() {
  return requestJson<TeamsResponse>("/api/liara/teams");
}

export function selectTeam(teamId: string | null) {
  return requestJson<{ selectedTeamId: string | null }>("/api/liara/team", {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}
