"use client";

import { create } from "zustand";
import { DEFAULT_AGENT_MODE, type AgentMode } from "./config";

type AgentModeState = {
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
};

export const useAgentModeStore = create<AgentModeState>()((set) => ({
  mode: DEFAULT_AGENT_MODE,
  setMode: (mode) => set({ mode }),
}));
