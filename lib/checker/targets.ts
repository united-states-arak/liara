import type { ResourceKind } from "@/lib/liara/services";
import { taggedResources } from "@/lib/liara/tags";

export const PERSONAL_TEAM_KEY = "personal";

/** Tag scope for the selected Liara team, or the personal account. */
export function teamKeyOf(teamId: string | null): string {
  return teamId ?? PERSONAL_TEAM_KEY;
}

export interface CheckTarget {
  kind: ResourceKind;
  /** Stable id at Liara. For apps this is the project name. */
  resourceId: string;
  /** Display name, stored as findings.projectName. */
  name: string;
}

/** Monitored tags for the team. Empty when no resource is tagged. */
export async function loadTaggedTargets(teamId: string | null): Promise<CheckTarget[]> {
  const rows = await taggedResources(teamKeyOf(teamId), { monitoredOnly: true });
  return rows.map(({ kind, resourceId, name }) => ({ kind, resourceId, name }));
}
