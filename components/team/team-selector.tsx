"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, LoaderCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchTeams, selectTeam, TEAMS_QUERY_KEY } from "./api";

const PERSONAL_VALUE = "personal";

export function TeamSelector({ onChanged }: { onChanged?: () => void }) {
  const queryClient = useQueryClient();

  const teams = useQuery({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: fetchTeams,
    staleTime: 60_000,
  });

  const select = useMutation({
    mutationFn: selectTeam,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onChanged?.();
    },
  });

  const data = teams.data;
  const selectedId = data?.selectedTeamId ?? null;
  const selectedTeam = selectedId ? data?.teams.find((team) => team.id === selectedId) : undefined;
  const isTeamSelected = selectedId !== null;

  const label = teams.isPending
    ? "Loading..."
    : !data
      ? "Teams unavailable"
      : !isTeamSelected
        ? "Personal"
        : (selectedTeam?.name ?? "Unknown team");

  const nameCounts = new Map<string, number>();
  for (const team of data?.teams ?? []) {
    nameCounts.set(team.name, (nameCounts.get(team.name) ?? 0) + 1);
  }

  const choose = (value: string) => {
    const teamId = value === PERSONAL_VALUE ? null : value;
    if (teamId === selectedId || select.isPending) return;
    select.mutate(teamId);
  };

  const Icon = isTeamSelected ? Building2 : User;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="max-w-56 min-w-0"
              aria-label={`Liara account: ${label}`}
              disabled={select.isPending}
            />
          }
        >
          {teams.isPending || select.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Icon aria-hidden />
          )}
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="opacity-60" aria-hidden />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-64" align="start">
          {teams.isError || data?.error ? (
            <div className="space-y-1 px-1.5 py-1">
              <p role="alert" className="text-xs text-destructive">
                {teams.error?.message ?? data?.error}
              </p>
              <button
                type="button"
                className="text-xs font-medium underline underline-offset-2"
                onClick={() => void teams.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {data && (
            <>
              <DropdownMenuRadioGroup value={selectedId ?? PERSONAL_VALUE} onValueChange={choose}>
                <DropdownMenuRadioItem value={PERSONAL_VALUE}>
                  <div className="flex min-w-0 flex-col">
                    <span>Personal</span>
                    {data.personal && (
                      <span className="truncate text-xs text-muted-foreground">
                        {data.personal.email}
                      </span>
                    )}
                  </div>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              {data.teams.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Teams</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={selectedId ?? PERSONAL_VALUE}
                      onValueChange={choose}
                    >
                      {data.teams.map((team) => (
                        <DropdownMenuRadioItem key={team.id} value={team.id}>
                          <span className="truncate">
                            {(nameCounts.get(team.name) ?? 0) > 1
                              ? `${team.name} (${team.id})`
                              : team.name}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {select.isError && (
        <span role="alert" className="max-w-64 truncate text-xs text-destructive">
          {select.error.message}
        </span>
      )}
    </div>
  );
}
