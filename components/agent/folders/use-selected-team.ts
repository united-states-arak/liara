"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTeams, TEAMS_QUERY_KEY } from "@/components/team/api";

/** Selected Liara team ID (null for personal), or undefined until the teams query has loaded. */
export function useSelectedTeamId(): string | null | undefined {
  const teams = useQuery({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: fetchTeams,
    staleTime: 60_000,
  });
  return teams.data?.selectedTeamId;
}
