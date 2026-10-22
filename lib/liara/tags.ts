import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ResourceKind } from "./services";

const { resourceTags } = schema;

export type ResourceTag = {
  id: string;
  teamKey: string;
  kind: ResourceKind;
  resourceId: string;
  name: string;
  monitored: boolean;
  createdAt: number;
};

type TagRow = typeof resourceTags.$inferSelect;

export type TagInput = {
  kind: ResourceKind;
  resourceId: string;
  name: string;
  monitored?: boolean;
};

function toTag(row: TagRow): ResourceTag {
  return {
    id: row.id,
    teamKey: row.teamKey,
    kind: row.kind,
    resourceId: row.resourceId,
    name: row.name,
    monitored: row.monitored,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listTags(teamKey: string): Promise<ResourceTag[]> {
  return taggedResources(teamKey);
}

export async function taggedResources(
  teamKey: string,
  options: { monitoredOnly?: boolean } = {},
): Promise<ResourceTag[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        eq(resourceTags.teamKey, teamKey),
        options.monitoredOnly ? eq(resourceTags.monitored, true) : undefined,
      ),
    )
    .orderBy(asc(resourceTags.createdAt));
  return rows.map(toTag);
}

/** Creates the tag, or updates its name (and monitored flag, when given) if it exists. */
export async function tagResource(teamKey: string, input: TagInput): Promise<ResourceTag> {
  const db = await getDb();
  const monitored = input.monitored ?? true;
  const [row] = await db
    .insert(resourceTags)
    .values({
      id: randomUUID(),
      teamKey,
      kind: input.kind,
      resourceId: input.resourceId,
      name: input.name,
      monitored,
    })
    .onConflictDoUpdate({
      target: [resourceTags.teamKey, resourceTags.kind, resourceTags.resourceId],
      set:
        input.monitored === undefined
          ? { name: input.name }
          : { name: input.name, monitored: input.monitored },
    })
    .returning();
  if (!row) {
    throw new Error("Tag was not saved.");
  }
  return toTag(row);
}

/** Returns false when no tag matched. Pass teamKey to scope the delete to one team. */
export async function untagResource(id: string, teamKey?: string): Promise<boolean> {
  const db = await getDb();
  const removed = await db
    .delete(resourceTags)
    .where(byId(id, teamKey))
    .returning({ id: resourceTags.id });
  return removed.length > 0;
}

/** Returns the updated tag, or null when no tag matched. */
export async function setMonitored(
  id: string,
  monitored: boolean,
  teamKey?: string,
): Promise<ResourceTag | null> {
  const db = await getDb();
  const [row] = await db
    .update(resourceTags)
    .set({ monitored })
    .where(byId(id, teamKey))
    .returning();
  return row ? toTag(row) : null;
}

function byId(id: string, teamKey: string | undefined) {
  return and(
    eq(resourceTags.id, id),
    teamKey === undefined ? undefined : eq(resourceTags.teamKey, teamKey),
  );
}
