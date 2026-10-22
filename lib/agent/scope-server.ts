import type { ResourceRef } from "./scope";
import { scopeFromMetadata } from "./scope";
import { listAttachableResources } from "@/lib/liara/resources";
import { listThreadMessages } from "./threads-store";

export type ScopeCheck = { ok: true; scope: ResourceRef[] } | { ok: false; error: string };

export async function verifyScope(
  token: string,
  refs: readonly ResourceRef[],
  teamId?: string,
): Promise<ScopeCheck> {
  if (refs.length === 0) return { ok: true, scope: [] };
  const types = [...new Set(refs.map((ref) => ref.type))];
  const listings = await Promise.all(
    types.map(async (type) => [type, await listAttachableResources(token, type, teamId)] as const),
  );
  const accountIds = new Map(
    listings.flatMap(([type, items]) => items.map((item) => [`${type}:${item.id}`, item] as const)),
  );

  const missing: string[] = [];
  const scope: ResourceRef[] = [];
  for (const ref of refs) {
    const found =
      accountIds.get(`${ref.type}:${ref.id}`) ??
      [...accountIds.values()].find((item) => item.type === ref.type && item.name === ref.name);
    if (!found) {
      missing.push(ref.name);
      continue;
    }
    scope.push({ type: found.type, id: found.id, name: found.name });
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `These attached resources are not on this Liara account: ${missing.join(", ")}. Remove them from the chips above and try again.`,
    };
  }
  return { ok: true, scope };
}

export async function latestStoredScope(threadId: string): Promise<ResourceRef[]> {
  const rows = await listThreadMessages(threadId);
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (row.role !== "user") continue;
    const scope = scopeFromMetadata(row.uiMessage.metadata);
    if (scope) return scope;
  }
  return [];
}
