import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { folders as foldersTable, threads as threadsTable } from "@/db/schema";

export const FOLDER_NAME_MAX_CHARS = 60;

export type FolderSummary = {
  id: string;
  name: string;
  createdAt: number;
};

/** Trimmed folder name, or null when it is empty or longer than the limit. */
export function normalizeFolderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || Array.from(name).length > FOLDER_NAME_MAX_CHARS) return null;
  return name;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export async function listFolders(teamKey: string): Promise<FolderSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: foldersTable.id,
      name: foldersTable.name,
      createdAt: foldersTable.createdAt,
    })
    .from(foldersTable)
    .where(eq(foldersTable.teamKey, teamKey));
  return rows
    .map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt.getTime() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFolder(id: string, teamKey: string): Promise<FolderSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: foldersTable.id,
      name: foldersTable.name,
      createdAt: foldersTable.createdAt,
    })
    .from(foldersTable)
    .where(and(eq(foldersTable.id, id), eq(foldersTable.teamKey, teamKey)))
    .limit(1);
  return row ? { id: row.id, name: row.name, createdAt: row.createdAt.getTime() } : null;
}

/** Null when the team already has a folder with this name (case-insensitive). */
export async function createFolder(teamKey: string, name: string): Promise<FolderSummary | null> {
  const existing = await listFolders(teamKey);
  if (existing.some((folder) => sameName(folder.name, name))) return null;
  const db = await getDb();
  const id = randomUUID();
  const createdAt = Date.now();
  await db.insert(foldersTable).values({ id, name, teamKey, createdAt: new Date(createdAt) });
  return { id, name, createdAt };
}

export type RenameFolderResult =
  | { status: "ok"; folder: FolderSummary }
  | { status: "not_found" }
  | { status: "duplicate" };

export async function renameFolder(
  id: string,
  teamKey: string,
  name: string,
): Promise<RenameFolderResult> {
  const folders = await listFolders(teamKey);
  const current = folders.find((folder) => folder.id === id);
  if (!current) return { status: "not_found" };
  if (folders.some((folder) => folder.id !== id && sameName(folder.name, name))) {
    return { status: "duplicate" };
  }
  const db = await getDb();
  await db
    .update(foldersTable)
    .set({ name })
    .where(and(eq(foldersTable.id, id), eq(foldersTable.teamKey, teamKey)));
  return { status: "ok", folder: { ...current, name } };
}

/** Deletes the folder and unfiles its threads. Threads and messages are kept. */
export async function deleteFolder(id: string, teamKey: string): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: foldersTable.id })
      .from(foldersTable)
      .where(and(eq(foldersTable.id, id), eq(foldersTable.teamKey, teamKey)))
      .limit(1);
    if (owned.length === 0) return false;
    await tx
      .update(threadsTable)
      .set({ folderId: null })
      .where(and(eq(threadsTable.folderId, id), eq(threadsTable.teamKey, teamKey)));
    await tx.delete(foldersTable).where(eq(foldersTable.id, id));
    return true;
  });
}

export type FolderRef = { folderId: string | null } | { error: string };

/** Checks that a folder reference (null or a folder ID) names a folder of this team. */
export async function resolveFolderRef(value: unknown, teamKey: string): Promise<FolderRef> {
  if (value === null) return { folderId: null };
  if (typeof value !== "string" || value.length === 0) {
    return { error: "Invalid folder." };
  }
  const folder = await getFolder(value, teamKey);
  if (!folder) return { error: "Folder not found." };
  return { folderId: folder.id };
}
