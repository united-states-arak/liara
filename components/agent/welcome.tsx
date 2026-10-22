"use client";

import { AGENT_MODE_META } from "@/lib/agent/config";
import { useAgentModeStore } from "@/lib/agent/mode-store";

export function AgentWelcome() {
  const mode = useAgentModeStore((state) => state.mode);
  const meta = AGENT_MODE_META[mode];
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col gap-2 px-2">
      <p className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">
        {meta.label} mode
      </p>
      <p className="text-muted-foreground text-sm">{meta.description}</p>
    </div>
  );
}
