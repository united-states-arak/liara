"use client";

import { ThreadListItemMorePrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, FolderIcon, MessageSquareIcon } from "lucide-react";
import type { FC } from "react";
import { folderIdFromCustom } from "@/lib/agent/thread-adapter";
import { fetchFolders, FOLDERS_QUERY_KEY } from "./api";

const itemClassName =
  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none";

export const MoveToFolderMenuItems: FC = () => {
  const aui = useAui();
  const currentFolderId = useAuiState((s) => folderIdFromCustom(s.threadListItem.custom));
  const folders = useQuery({
    queryKey: FOLDERS_QUERY_KEY,
    queryFn: fetchFolders,
    staleTime: 30_000,
  });

  const moveTo = (folderId: string | null) => {
    aui.threadListItem.updateCustom({ folderId });
  };

  return (
    <>
      <ThreadListItemMorePrimitive.Separator className="bg-border -mx-1 my-1 h-px" />
      <div className="text-muted-foreground px-2.5 pt-1 pb-0.5 text-xs font-medium">
        Move to folder
      </div>
      <ThreadListItemMorePrimitive.Item
        data-slot="aui_thread-list-item-more-item"
        className={itemClassName}
        onSelect={() => moveTo(null)}
      >
        <MessageSquareIcon className="size-4" />
        <span className="min-w-0 flex-1 truncate">Chats</span>
        {currentFolderId === null && <CheckIcon className="size-3.5" aria-hidden />}
      </ThreadListItemMorePrimitive.Item>
      {folders.data?.folders.map((folder) => (
        <ThreadListItemMorePrimitive.Item
          key={folder.id}
          data-slot="aui_thread-list-item-more-item"
          className={itemClassName}
          onSelect={() => moveTo(folder.id)}
        >
          <FolderIcon className="size-4" />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          {currentFolderId === folder.id && <CheckIcon className="size-3.5" aria-hidden />}
        </ThreadListItemMorePrimitive.Item>
      ))}
      {folders.data?.folders.length === 0 && (
        <div className="text-muted-foreground px-2.5 py-1.5 text-xs">No folders yet</div>
      )}
    </>
  );
};
