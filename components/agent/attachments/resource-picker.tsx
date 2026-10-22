"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuiState } from "@assistant-ui/react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RESOURCE_TYPE_LABEL,
  RESOURCE_TYPES,
  resourceKey,
  type AttachableResource,
  type ResourceRef,
  type ResourceType,
} from "@/lib/agent/scope";
import type { ResourcesResponse, ResourcesSection } from "@/lib/liara/resources";
import { RESOURCE_ICON } from "./attached-chips";
import { useAttachedResources, useResourceScopeStore } from "./scope-store";

async function fetchResources(): Promise<ResourcesResponse> {
  const response = await fetch("/api/resources", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load resources.");
  return (await response.json()) as ResourcesResponse;
}

export function ResourcePicker() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <TooltipIconButton
            tooltip="Attach resources"
            side="bottom"
            variant="ghost"
            size="icon"
            aria-label="Attach resources"
            className="aui-composer-add-attachment text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none"
          />
        }
      >
        <PlusIcon className="aui-attachment-add-icon size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {open ? <ResourcePickerBody onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ResourcePickerBody({ onDone }: { onDone: () => void }) {
  const threadId = useAuiState((state) => state.threadListItem.id);
  const attached = useAttachedResources();
  const setDraft = useResourceScopeStore((state) => state.setDraft);
  const [selected, setSelected] = useState<ResourceRef[]>(attached);
  const [query, setQuery] = useState("");
  const resources = useQuery({
    queryKey: ["agent-resources"],
    queryFn: fetchResources,
    retry: false,
  });

  const selectedKeys = new Set(selected.map(resourceKey));

  const toggle = (item: AttachableResource) => {
    const ref: ResourceRef = { type: item.type, id: item.id, name: item.name };
    setSelected((current) =>
      current.some((entry) => resourceKey(entry) === resourceKey(ref))
        ? current.filter((entry) => resourceKey(entry) !== resourceKey(ref))
        : [...current, ref],
    );
  };

  const attach = () => {
    setDraft(threadId, selected);
    onDone();
  };

  const data = resources.data;
  let content: ReactNode;
  if (data?.connected === false) {
    content = <NotConnected onRetry={() => void resources.refetch()} />;
  } else if (data?.connected) {
    content = (
      <ResourceSections
        data={data}
        query={query}
        selectedKeys={selectedKeys}
        onToggle={toggle}
        onQueryChange={setQuery}
      />
    );
  } else if (resources.isError) {
    content = <LoadError onRetry={() => void resources.refetch()} />;
  } else {
    content = <ListSkeleton />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Attach Liara resources</DialogTitle>
        <DialogDescription>
          The agent can read and change only the resources attached to this conversation.
        </DialogDescription>
      </DialogHeader>
      {content}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={selected.length === 0} onClick={attach}>
          Attach {selected.length}
        </Button>
      </DialogFooter>
    </>
  );
}

function ResourceSections({
  data,
  query,
  selectedKeys,
  onToggle,
  onQueryChange,
}: {
  data: Extract<ResourcesResponse, { connected: true }>;
  query: string;
  selectedKeys: Set<string>;
  onToggle: (item: AttachableResource) => void;
  onQueryChange: (value: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const sections: Record<ResourceType, ResourcesSection> = {
    app: data.apps,
    database: data.databases,
    bucket: data.buckets,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search apps, databases and buckets"
          aria-label="Search resources"
          className="ps-8"
        />
      </div>
      <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pe-1">
        {RESOURCE_TYPES.map((type) => {
          const section = sections[type];
          const Icon = RESOURCE_ICON[type];
          const items = section.ok
            ? section.items.filter(
                (item) =>
                  needle === "" ||
                  item.name.toLowerCase().includes(needle) ||
                  item.id.toLowerCase().includes(needle),
              )
            : [];
          return (
            <section key={type} aria-label={RESOURCE_TYPE_LABEL[type]} className="flex flex-col">
              <h3 className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" aria-hidden />
                {RESOURCE_TYPE_LABEL[type]}
              </h3>
              {!section.ok ? (
                <p role="alert" className="text-destructive px-2 py-1.5 text-xs">
                  {section.message}
                </p>
              ) : section.items.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">None on this account.</p>
              ) : items.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">No matches.</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((item) => (
                    <li key={resourceKey(item)}>
                      <label className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(resourceKey(item))}
                          onChange={() => onToggle(item)}
                          className="accent-primary size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                        {item.detail ? (
                          <span className="text-muted-foreground max-w-[45%] truncate text-xs">
                            {item.detail}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NotConnected({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Connect a Liara account to attach apps, databases and buckets. Add your token in Settings,
        then retry.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SettingsDialog />
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 text-sm">
      <p className="text-destructive">Could not load resources.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Loading resources</span>
      <Skeleton className="h-8 w-full motion-reduce:animate-none" />
      <Skeleton className="h-8 w-full motion-reduce:animate-none" />
      <Skeleton className="h-8 w-4/5 motion-reduce:animate-none" />
    </div>
  );
}
