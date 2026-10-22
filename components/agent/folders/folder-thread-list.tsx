"use client";

import {
  ThreadListItem,
  ThreadListItemMenuItemsContext,
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from "@/components/assistant-ui/elements/thread-list.aui";
import { ThreadListPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, ChevronDownIcon, ChevronRightIcon, FolderPlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import { folderIdFromCustom } from "@/lib/agent/thread-adapter";
import { fetchFolders, FOLDERS_QUERY_KEY } from "./api";
import { FolderSection, NewFolderRow } from "./folder-section";
import { MoveToFolderMenuItems } from "./move-to-folder-items";
import { useSelectedTeamId } from "./use-selected-team";

const sectionLabelClassName = "text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium";

/** Sidebar thread list: folders above the unfiled "Chats", scoped to the selected Liara team. */
export const FolderThreadList: FC = () => {
  const aui = useAui();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const threadItems = useAuiState((s) => s.threads.threadItems);
  const threadsLoading = useAuiState((s) => s.threads.isLoading);
  const archivedIds = useAuiState((s) => s.threads.archivedThreadIds);
  const [showArchived, setShowArchived] = useState(false);
  const folders = useQuery({
    queryKey: FOLDERS_QUERY_KEY,
    queryFn: fetchFolders,
    staleTime: 30_000,
  });

  const teamId = useSelectedTeamId();
  const shownTeamRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (teamId === undefined) return;
    if (shownTeamRef.current === undefined) {
      shownTeamRef.current = teamId;
      return;
    }
    if (shownTeamRef.current === teamId) return;
    shownTeamRef.current = teamId;
    void aui.threads.reload();
  }, [aui, teamId]);

  const folderById = useMemo(
    () => new Map(threadItems.map((item) => [item.id, folderIdFromCustom(item.custom)])),
    [threadItems],
  );
  const titleById = useMemo(
    () => new Map(threadItems.map((item) => [item.id, (item.title || "New Chat").toLowerCase()])),
    [threadItems],
  );
  const isUnfiled = useCallback(
    (id: string) => (folderById.get(id) ?? null) === null,
    [folderById],
  );

  const query = search.trim().toLowerCase();
  const matches = (id: string) => !query || (titleById.get(id) ?? "").includes(query);
  const indicesIn = (folderId: string) =>
    threadIds.flatMap((id, index) =>
      folderById.get(id) === folderId && matches(id) ? [index] : [],
    );
  const countIn = (folderId: string) =>
    threadIds.filter((id) => folderById.get(id) === folderId).length;

  const toggleFolder = (folderId: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });

  const hasThreads = threadIds.length > 0;
  const folderList = folders.data?.folders ?? [];
  const unfiledMatches = threadIds.some((id) => isUnfiled(id) && matches(id));
  const anyMatches = unfiledMatches || folderList.some((folder) => indicesIn(folder.id).length > 0);

  return (
    <ThreadListItemMenuItemsContext.Provider value={MoveToFolderMenuItems}>
      <ThreadListRoot>
        <ThreadListNew />
        {hasThreads && <ThreadListSearch value={search} onValueChange={setSearch} />}

        <div data-slot="aui_folders" className="flex flex-col gap-0.5">
          <div className="flex h-7 items-center justify-between ps-2.5 pe-0.5 pt-3 pb-1">
            <span className="text-muted-foreground text-xs font-medium">Folders</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New folder"
              title="New folder"
              className="size-6"
              onClick={() => setCreating(true)}
            >
              <FolderPlusIcon className="size-3.5" />
            </Button>
          </div>
          {creating && <NewFolderRow onDone={() => setCreating(false)} />}
          {folderList.map((folder) => {
            const indices = indicesIn(folder.id);
            if (query && indices.length === 0) return null;
            return (
              <FolderSection
                key={folder.id}
                folder={folder}
                threadIds={threadIds}
                indices={indices}
                total={countIn(folder.id)}
                open={!collapsed.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
              />
            );
          })}
        </div>

        {query && !anyMatches && (
          <div
            data-slot="aui_thread-list-empty"
            className="text-muted-foreground px-2.5 py-4 text-sm"
          >
            No threads found
          </div>
        )}
        {(threadsLoading || hasThreads) && (!query || unfiledMatches) && (
          <div data-slot="aui_chats" className="flex flex-col gap-0.5">
            <div className={sectionLabelClassName}>Chats</div>
            <ThreadListItems searchQuery={search} include={isUnfiled} />
          </div>
        )}
        {archivedIds.length > 0 && (
          <div data-slot="aui_archived" className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              aria-expanded={showArchived}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2.5 pt-3 pb-1 text-xs font-medium"
            >
              {showArchived ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
              <ArchiveIcon className="size-3.5" />
              Archived ({archivedIds.length})
            </button>
            {showArchived &&
              archivedIds.map((id, index) => (
                <ThreadListPrimitive.ItemByIndex
                  key={id}
                  index={index}
                  archived
                  components={{ ThreadListItem }}
                />
              ))}
          </div>
        )}
      </ThreadListRoot>
    </ThreadListItemMenuItemsContext.Provider>
  );
};
