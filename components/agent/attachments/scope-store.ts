"use client";

import { create } from "zustand";
import type { ResourceRef } from "@/lib/agent/scope";

const NONE: ResourceRef[] = [];

type ResourceScopeState = {
  activeThreadId: string | undefined;
  persisted: Record<string, ResourceRef[]>;
  drafts: Record<string, ResourceRef[]>;
  syncThread: (threadId: string, persisted: ResourceRef[]) => void;
  setDraft: (threadId: string, resources: ResourceRef[]) => void;
};

export const useResourceScopeStore = create<ResourceScopeState>()((set) => ({
  activeThreadId: undefined,
  persisted: {},
  drafts: {},
  syncThread: (threadId, persisted) =>
    set((state) => ({
      activeThreadId: threadId,
      persisted: { ...state.persisted, [threadId]: persisted },
    })),
  setDraft: (threadId, resources) =>
    set((state) => ({ drafts: { ...state.drafts, [threadId]: resources } })),
}));

function resourcesFor(state: ResourceScopeState, threadId: string | undefined): ResourceRef[] {
  if (threadId === undefined) return NONE;
  return state.drafts[threadId] ?? state.persisted[threadId] ?? NONE;
}

export function useAttachedResources(): ResourceRef[] {
  return useResourceScopeStore((state) => resourcesFor(state, state.activeThreadId));
}

/** Read at send time by the chat transport. */
export function requestResourceScope(): ResourceRef[] {
  const state = useResourceScopeStore.getState();
  return resourcesFor(state, state.activeThreadId);
}
