"use client";

import { useEffect } from "react";
import { useAuiState, type ThreadMessage } from "@assistant-ui/react";
import { AppWindow, Database, FolderArchive, XIcon, type LucideIcon } from "lucide-react";
import {
  resourceKey,
  scopeFromMetadata,
  type ResourceRef,
  type ResourceType,
} from "@/lib/agent/scope";
import { useAttachedResources, useResourceScopeStore } from "./scope-store";

export const RESOURCE_ICON: Record<ResourceType, LucideIcon> = {
  app: AppWindow,
  database: Database,
  bucket: FolderArchive,
};

const RESOURCE_TYPE_NAME: Record<ResourceType, string> = {
  app: "App",
  database: "Database",
  bucket: "Bucket",
};

function scopeFromMessages(messages: readonly ThreadMessage[]): ResourceRef[] | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const scope = scopeFromMetadata(message.metadata?.custom);
    if (scope) return scope;
  }
  return null;
}

export function AttachedResourceChips() {
  const threadId = useAuiState((state) => state.threadListItem.id);
  const persistedJson = useAuiState((state) =>
    JSON.stringify(scopeFromMessages(state.thread.messages)),
  );
  const attached = useAttachedResources();
  const setDraft = useResourceScopeStore((state) => state.setDraft);

  useEffect(() => {
    const persisted: ResourceRef[] | null = JSON.parse(persistedJson);
    useResourceScopeStore.getState().syncThread(threadId, persisted ?? []);
  }, [threadId, persistedJson]);

  if (attached.length === 0) return null;

  return (
    <ul
      aria-label="Attached resources"
      data-slot="agent-attached-resources"
      className="flex flex-wrap gap-1.5"
    >
      {attached.map((ref) => {
        const Icon = RESOURCE_ICON[ref.type];
        return (
          <li
            key={resourceKey(ref)}
            className="bg-background text-foreground inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 ps-2 pe-0.5 text-xs"
          >
            <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{RESOURCE_TYPE_NAME[ref.type]}: </span>
            <span className="min-w-0 truncate font-medium">{ref.name}</span>
            <button
              type="button"
              aria-label={`Remove ${ref.name}`}
              onClick={() =>
                setDraft(
                  threadId,
                  attached.filter((item) => resourceKey(item) !== resourceKey(ref)),
                )
              }
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
