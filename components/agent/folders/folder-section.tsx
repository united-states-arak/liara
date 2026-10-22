"use client";

import { ThreadListPrimitive, useAui } from "@assistant-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { useRef, useState, type FC } from "react";
import { ThreadListItem } from "@/components/assistant-ui/elements/thread-list.aui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createFolder, deleteFolder, type Folder, FOLDERS_QUERY_KEY, renameFolder } from "./api";

export const FolderSection: FC<{
  folder: Folder;
  threadIds: readonly string[];
  indices: readonly number[];
  total: number;
  open: boolean;
  onToggle: () => void;
}> = ({ folder, threadIds, indices, total, open, onToggle }) => {
  const aui = useAui();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteFolder(folder.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY });
      await aui.threads.reload();
    },
  });

  return (
    <div data-slot="aui_folder" className="flex flex-col gap-0.5">
      <div className="group hover:bg-muted relative flex h-8 items-center rounded-md transition-colors">
        {renaming ? (
          <FolderRenameInput folder={folder} onDone={() => setRenaming(false)} />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            data-slot="aui_folder-toggle"
            className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md ps-2 pe-9 text-start text-sm outline-none focus-visible:ring-1"
          >
            <ChevronRightIcon
              aria-hidden
              className={cn(
                "text-muted-foreground size-3.5 shrink-0 transition-transform",
                open && "rotate-90",
              )}
            />
            <FolderIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <span data-slot="aui_folder-name" className="min-w-0 flex-1 truncate">
              {folder.name}
            </span>
            <span
              data-slot="aui_folder-count"
              className="text-muted-foreground text-xs tabular-nums"
            >
              {total}
            </span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Options for folder ${folder.name}`}
                className="data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 data-[state=open]:opacity-100"
              />
            }
          >
            <MoreHorizontalIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={6} className="min-w-32">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => remove.mutate()}>
              <TrashIcon />
              Delete folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {remove.isError && (
        <p role="alert" className="text-destructive px-2.5 text-xs">
          {remove.error.message}
        </p>
      )}
      {open &&
        indices.map((index) => (
          <ThreadListPrimitive.ItemByIndex
            key={threadIds[index]}
            index={index}
            components={{ ThreadListItem }}
          />
        ))}
    </div>
  );
};

const FolderRenameInput: FC<{ folder: Folder; onDone: () => void }> = ({ folder, onDone }) => {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(folder.name);
  const settledRef = useRef(false);

  const rename = useMutation({
    mutationFn: (name: string) => renameFolder(folder.id, name),
    onSuccess: async () => {
      settledRef.current = true;
      await queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY });
      onDone();
    },
  });

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone();
  };

  const commit = () => {
    if (settledRef.current || rename.isPending) return;
    const next = value.trim();
    if (!next || next === folder.name) {
      cancel();
      return;
    }
    rename.mutate(next);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1">
      <Input
        autoFocus
        aria-label="Folder name"
        aria-invalid={rename.isError || undefined}
        value={value}
        maxLength={200}
        className="h-7 text-sm"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
      {rename.isError && (
        <p role="alert" className="text-destructive text-xs">
          {rename.error.message}
        </p>
      )}
    </div>
  );
};

export const NewFolderRow: FC<{ onDone: () => void }> = ({ onDone }) => {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const settledRef = useRef(false);

  const create = useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: async () => {
      settledRef.current = true;
      await queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY });
      onDone();
    },
  });

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone();
  };

  const submit = () => {
    if (create.isPending) return;
    const name = value.trim();
    if (!name) {
      cancel();
      return;
    }
    create.mutate(name);
  };

  return (
    <div className="flex flex-col gap-0.5 px-0.5">
      <Input
        autoFocus
        aria-label="New folder name"
        placeholder="Folder name"
        aria-invalid={create.isError || undefined}
        value={value}
        maxLength={200}
        className="h-7 text-sm"
        onChange={(event) => setValue(event.target.value)}
        onBlur={cancel}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
      {create.isError && (
        <p role="alert" className="text-destructive px-1 text-xs">
          {create.error.message}
        </p>
      )}
    </div>
  );
};
