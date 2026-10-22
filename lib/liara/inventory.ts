import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { redact } from "@/lib/redact";
import { liaraContext } from "@/lib/settings";
import { LiaraError, type LiaraErrorKind } from "./client";
import {
  isResourceKind,
  RESOURCE_KINDS,
  SERVICES,
  type ResourceItem,
  type ResourceKind,
} from "./services";

const { resourceSnapshots } = schema;

export const INVENTORY_TTL_MS = 5 * 60 * 1000;

const PERSONAL_KEY = "personal";
const ERROR_KINDS: readonly LiaraErrorKind[] = [
  "auth",
  "rate_limited",
  "not_found",
  "server",
  "network",
  "unknown",
];

export type InventorySection = {
  ok: boolean;
  items: ResourceItem[];
  /** When the items were last fetched successfully. Null if never. */
  fetchedAt: number | null;
  error?: LiaraErrorKind;
};

export type Inventory = Record<ResourceKind, InventorySection>;

/**
 * Stored in resource_snapshots.payload. fetchedAt on the row is the last
 * attempt (success or failure); lastSuccessAt is when items were last read.
 * Keeping both lets a failed refresh back off for the TTL without losing
 * the last good items.
 */
type Snapshot = {
  items: ResourceItem[];
  lastSuccessAt: number | null;
};

type CachedRow = {
  snapshot: Snapshot;
  attemptedAt: number;
  error: LiaraErrorKind | null;
};

/** Cache key for a Liara team, or for the personal account when teamId is null. */
export function teamKeyOf(teamId: string | null | undefined): string {
  return teamId?.trim() || PERSONAL_KEY;
}

export async function getInventory(
  teamKey: string,
  options: { refresh?: boolean } = {},
): Promise<Inventory> {
  const [cached, ctx] = await Promise.all([readSnapshots(teamKey), liaraContext()]);
  const now = Date.now();

  const entries = await Promise.all(
    RESOURCE_KINDS.map(async (kind) => {
      const row = cached.get(kind);
      if (!ctx) return [kind, staleSection(row, "auth")] as const;
      if (!options.refresh && row && now - row.attemptedAt < INVENTORY_TTL_MS) {
        return [kind, sectionFromRow(row)] as const;
      }
      return [kind, await refreshKind(teamKey, kind, ctx.token, row, now)] as const;
    }),
  );

  return Object.fromEntries(entries) as Inventory;
}

/** Cached data only. Never calls Liara. */
export async function getCachedInventory(teamKey: string): Promise<Inventory> {
  const cached = await readSnapshots(teamKey);
  const entries = RESOURCE_KINDS.map((kind) => {
    const row = cached.get(kind);
    return [kind, row ? sectionFromRow(row) : emptySection()] as const;
  });
  return Object.fromEntries(entries) as Inventory;
}

/** Marks every kind for the team as stale. Stored items are kept as fallback. */
export async function invalidateInventory(teamKey: string): Promise<void> {
  const db = await getDb();
  await db
    .update(resourceSnapshots)
    .set({ fetchedAt: new Date(0) })
    .where(eq(resourceSnapshots.teamKey, teamKey));
}

async function refreshKind(
  teamKey: string,
  kind: ResourceKind,
  token: string,
  row: CachedRow | undefined,
  now: number,
): Promise<InventorySection> {
  const teamId = teamKey === PERSONAL_KEY ? undefined : teamKey;

  let items: ResourceItem[];
  try {
    items = await SERVICES[kind].list({ token, teamId });
  } catch (error) {
    const errorKind = kindOf(error);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[inventory] ${kind} failed (${errorKind}): ${redact(message, [token])}`);

    const snapshot: Snapshot = {
      items: row?.snapshot.items ?? [],
      lastSuccessAt: row?.snapshot.lastSuccessAt ?? null,
    };
    await writeSnapshot(teamKey, kind, snapshot, now, errorKind);
    return {
      ok: false,
      items: snapshot.items,
      fetchedAt: snapshot.lastSuccessAt,
      error: errorKind,
    };
  }

  await writeSnapshot(teamKey, kind, { items, lastSuccessAt: now }, now, null);
  return { ok: true, items, fetchedAt: now };
}

async function readSnapshots(teamKey: string): Promise<Map<ResourceKind, CachedRow>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(resourceSnapshots)
    .where(eq(resourceSnapshots.teamKey, teamKey));

  const byKind = new Map<ResourceKind, CachedRow>();
  for (const row of rows) {
    if (!isResourceKind(row.kind)) continue;
    byKind.set(row.kind, {
      snapshot: parseSnapshot(row.payload),
      attemptedAt: row.fetchedAt.getTime(),
      error: isErrorKind(row.error) ? row.error : row.error ? "unknown" : null,
    });
  }
  return byKind;
}

async function writeSnapshot(
  teamKey: string,
  kind: ResourceKind,
  snapshot: Snapshot,
  attemptedAt: number,
  error: LiaraErrorKind | null,
): Promise<void> {
  const db = await getDb();
  const fetchedAt = new Date(attemptedAt);
  await db
    .insert(resourceSnapshots)
    .values({ teamKey, kind, payload: snapshot, fetchedAt, error })
    .onConflictDoUpdate({
      target: [resourceSnapshots.teamKey, resourceSnapshots.kind],
      set: { payload: snapshot, fetchedAt, error },
    });
}

function sectionFromRow(row: CachedRow): InventorySection {
  const section: InventorySection = {
    ok: row.error === null,
    items: row.snapshot.items,
    fetchedAt: row.snapshot.lastSuccessAt,
  };
  if (row.error) section.error = row.error;
  return section;
}

function staleSection(row: CachedRow | undefined, error: LiaraErrorKind): InventorySection {
  return {
    ok: false,
    items: row?.snapshot.items ?? [],
    fetchedAt: row?.snapshot.lastSuccessAt ?? null,
    error,
  };
}

function emptySection(): InventorySection {
  return { ok: false, items: [], fetchedAt: null };
}

function parseSnapshot(payload: unknown): Snapshot {
  const empty: Snapshot = { items: [], lastSuccessAt: null };
  if (typeof payload !== "object" || payload === null) return empty;
  const record = payload as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.filter(isResourceItem) : [];
  const lastSuccessAt = typeof record.lastSuccessAt === "number" ? record.lastSuccessAt : null;
  return { items, lastSuccessAt };
}

function isResourceItem(value: unknown): value is ResourceItem {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" && typeof record.name === "string" && isResourceKind(record.kind)
  );
}

function isErrorKind(value: unknown): value is LiaraErrorKind {
  return typeof value === "string" && (ERROR_KINDS as readonly string[]).includes(value);
}

function kindOf(error: unknown): LiaraErrorKind {
  return error instanceof LiaraError ? error.kind : "unknown";
}
