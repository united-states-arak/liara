"use client";

import {
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useMemo } from "react";
import { useHistoryErrorStore } from "./history-error-store";
import { titleFromText } from "./title";

type ThreadRow = {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  folderId: string | null;
  createdAt: number;
  lastMessageAt: number | null;
};

/** Custom metadata carried on each thread: the folder it is filed in. */
type ThreadCustom = { folderId: string | null };

const threadCustom = (thread: Pick<ThreadRow, "folderId">): ThreadCustom => ({
  folderId: thread.folderId,
});

export const folderIdFromCustom = (custom: Record<string, unknown> | undefined): string | null =>
  typeof custom?.folderId === "string" ? custom.folderId : null;

type StoredMessageRow = {
  id: string;
  role: string;
  uiMessage: unknown;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const threadPath = (remoteId: string) => `/api/threads/${encodeURIComponent(remoteId)}`;

const patchThread = (remoteId: string, patch: Record<string, unknown>) =>
  request<void>(threadPath(remoteId), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

function titleFromThreadMessages(messages: readonly ThreadMessage[]): string | undefined {
  const first = messages.find((message) => message.role === "user");
  if (!first) return undefined;
  const text = first.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
  return titleFromText(text);
}

function useThreadListAdapters() {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return { messages: [] };
      },
      async append() {},
      withFormat: (format) => ({
        async load() {
          const { remoteId } = aui.threadListItem.getState();
          const { setError } = useHistoryErrorStore.getState();
          if (!remoteId) {
            setError(null);
            return { messages: [] };
          }
          try {
            const { messages } = await request<{ messages: StoredMessageRow[] }>(
              `${threadPath(remoteId)}/messages`,
            );
            const repository = {
              // Stored turns form one linear conversation: chain each message to the previous
              // one and point headId at the last, or the runtime shows only a single message.
              headId: messages.at(-1)?.id ?? null,
              messages: messages.map((row, index) =>
                format.decode({
                  id: row.id,
                  parent_id: index === 0 ? null : messages[index - 1].id,
                  format: format.format,
                  content: row.uiMessage as Parameters<typeof format.decode>[0]["content"],
                }),
              ),
            };
            setError(null);
            return repository;
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unknown error.");
            throw error;
          }
        },
        async append() {
          // The chat route stores the whole conversation when each turn ends.
        },
      }),
    }),
    [aui],
  );
  return useMemo(() => ({ history }), [history]);
}

export const agentThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const { threads } = await request<{ threads: ThreadRow[] }>("/api/threads");
    return {
      threads: threads.map((thread) => ({
        remoteId: thread.id,
        status: thread.status,
        title: thread.title ?? undefined,
        lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt) : undefined,
        custom: threadCustom(thread),
      })),
    };
  },
  async initialize(_threadId, options) {
    const { id } = await request<{ id: string }>("/api/threads", {
      method: "POST",
      body: JSON.stringify({ folderId: folderIdFromCustom(options?.custom) }),
    });
    return { remoteId: id };
  },
  async rename(remoteId, title) {
    await patchThread(remoteId, { title });
  },
  async updateCustom(remoteId, custom) {
    await patchThread(remoteId, { folderId: folderIdFromCustom(custom) });
  },
  async archive(remoteId) {
    await patchThread(remoteId, { status: "archived" });
  },
  async unarchive(remoteId) {
    await patchThread(remoteId, { status: "regular" });
  },
  async delete(remoteId) {
    await request<void>(threadPath(remoteId), { method: "DELETE" });
  },
  async fetch(remoteId) {
    const thread = await request<ThreadRow>(threadPath(remoteId));
    return {
      remoteId: thread.id,
      status: thread.status,
      title: thread.title ?? undefined,
      custom: threadCustom(thread),
    };
  },
  async generateTitle(_remoteId, messages) {
    return createAssistantStream(async (controller) => {
      const title = titleFromThreadMessages(messages);
      if (title) controller.appendText(title);
    });
  },
  unstable_useAdapters: useThreadListAdapters,
};
