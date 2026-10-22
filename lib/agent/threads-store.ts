import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb } from "@/db";
import { messages as messagesTable, threads as threadsTable } from "@/db/schema";
import { getSelectedTeamId } from "@/lib/settings";
import { titleFromText } from "./title";

export type ThreadStatus = "regular" | "archived";

export type ThreadSummary = {
  id: string;
  title: string | null;
  status: ThreadStatus;
  folderId: string | null;
  createdAt: number;
  lastMessageAt: number | null;
};

const PERSONAL_TEAM_KEY = "personal";
const HIDDEN_VALUE = "[hidden]";
const ENV_TOOL_PART = "tool-update_env_vars";

function firstUserText(messages: readonly UIMessage[]): string | undefined {
  const first = messages.find((message) => message.role === "user");
  if (!first) return undefined;
  return first.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
}

export function threadTitleFor(messages: readonly UIMessage[]): string | undefined {
  const text = firstUserText(messages);
  return text === undefined ? undefined : titleFromText(text);
}

function storable(message: UIMessage): UIMessage {
  if (!message.parts.some((part) => part.type === ENV_TOOL_PART)) return message;
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== ENV_TOOL_PART) return part;
      const input = (part as { input?: unknown }).input;
      if (typeof input !== "object" || input === null) return part;
      const variables = (input as { variables?: unknown }).variables;
      if (!Array.isArray(variables)) return part;
      return {
        ...part,
        input: {
          ...input,
          variables: variables.map((variable: { key?: unknown }) => ({
            key: variable.key,
            value: HIDDEN_VALUE,
          })),
        },
      } as typeof part;
    }),
  };
}

/** Storage key for a Liara team ID. Null (the personal account) maps to "personal". */
export function teamKeyFor(teamId: string | null): string {
  return teamId ?? PERSONAL_TEAM_KEY;
}

/** Storage key for the team selected in settings. */
export async function currentTeamKey(): Promise<string> {
  return teamKeyFor(await getSelectedTeamId());
}

const summaryColumns = {
  id: threadsTable.id,
  title: threadsTable.title,
  status: threadsTable.status,
  folderId: threadsTable.folderId,
  createdAt: threadsTable.createdAt,
  lastMessageAt: sql<
    number | null
  >`(select max(${messagesTable.createdAt}) from ${messagesTable} where ${messagesTable.threadId} = ${threadsTable.id})`,
};

type SummaryRow = {
  id: string;
  title: string | null;
  status: ThreadStatus;
  folderId: string | null;
  createdAt: Date;
  lastMessageAt: number | null;
};

function toSummary(row: SummaryRow): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    folderId: row.folderId,
    createdAt: row.createdAt.getTime(),
    lastMessageAt: row.lastMessageAt ?? null,
  };
}

export async function listThreads(teamKey: string): Promise<ThreadSummary[]> {
  const db = await getDb();
  const rows = await db
    .select(summaryColumns)
    .from(threadsTable)
    .where(eq(threadsTable.teamKey, teamKey));

  return rows
    .map(toSummary)
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));
}

export async function createThread(teamKey: string, folderId: string | null): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.insert(threadsTable).values({ id, teamKey, folderId });
  return id;
}

export async function getThread(id: string, teamKey: string): Promise<ThreadSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select(summaryColumns)
    .from(threadsTable)
    .where(and(eq(threadsTable.id, id), eq(threadsTable.teamKey, teamKey)))
    .limit(1);
  return row ? toSummary(row) : null;
}

export type ThreadPatch = {
  title?: string | null;
  status?: ThreadStatus;
  folderId?: string | null;
};

export async function updateThread(
  id: string,
  teamKey: string,
  patch: ThreadPatch,
): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(threadsTable)
    .set(patch)
    .where(and(eq(threadsTable.id, id), eq(threadsTable.teamKey, teamKey)))
    .returning({ id: threadsTable.id });
  return updated.length > 0;
}

export async function deleteThread(id: string, teamKey: string): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: threadsTable.id })
      .from(threadsTable)
      .where(and(eq(threadsTable.id, id), eq(threadsTable.teamKey, teamKey)))
      .limit(1);
    if (owned.length === 0) return false;
    await tx.delete(messagesTable).where(eq(messagesTable.threadId, id));
    const deleted = await tx
      .delete(threadsTable)
      .where(eq(threadsTable.id, id))
      .returning({ id: threadsTable.id });
    return deleted.length > 0;
  });
}

export async function listThreadMessages(
  id: string,
): Promise<Array<{ id: string; role: string; uiMessage: UIMessage }>> {
  const db = await getDb();
  const rows = await db
    .select({
      id: messagesTable.id,
      role: messagesTable.role,
      uiMessage: messagesTable.uiMessage,
    })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, id))
    .orderBy(asc(sql`rowid`));
  return rows.map((row, index) => {
    const messageId = row.id || `${id}-${index}`;
    const uiMessage = row.uiMessage as UIMessage;
    return { id: messageId, role: row.role, uiMessage: { ...uiMessage, id: messageId } };
  });
}

/** Records a turn's incoming messages before streaming, so the user's prompt survives a reload mid-stream. */
export async function startTurn(threadId: string, incoming: readonly UIMessage[]): Promise<void> {
  const db = await getDb();
  const title = threadTitleFor(incoming);
  await db
    .insert(threadsTable)
    .values({ id: threadId, title: title ?? null, teamKey: await currentTeamKey() })
    .onConflictDoNothing();
  if (title !== undefined) {
    await db
      .update(threadsTable)
      .set({ title })
      .where(and(eq(threadsTable.id, threadId), isNull(threadsTable.title)));
  }
  await saveConversation(threadId, incoming);
}

/** Replaces the thread's stored messages with the given conversation. */
export async function saveConversation(
  threadId: string,
  conversation: readonly UIMessage[],
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(messagesTable).where(eq(messagesTable.threadId, threadId));
    if (conversation.length === 0) return;
    await tx
      .insert(messagesTable)
      .values(
        conversation.map((message) => {
          const stored = storable(message);
          return {
            id: stored.id || randomUUID(),
            threadId,
            role: stored.role,
            uiMessage: stored,
          };
        }),
      )
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: {
          threadId: sql`excluded.thread_id`,
          role: sql`excluded.role`,
          uiMessage: sql`excluded.ui_message`,
        },
      });
  });
}
