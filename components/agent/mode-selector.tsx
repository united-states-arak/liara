"use client";

import { Activity, Settings2, Wrench } from "lucide-react";
import { AGENT_MODES, AGENT_MODE_META, type AgentMode } from "@/lib/agent/config";
import { useAgentModeStore } from "@/lib/agent/mode-store";
import { cn } from "@/lib/utils";

const MODE_ICON: Record<AgentMode, typeof Wrench> = {
  setup: Wrench,
  manage: Settings2,
  monitor: Activity,
};

export function AgentModeSelector() {
  const mode = useAgentModeStore((state) => state.mode);
  const setMode = useAgentModeStore((state) => state.setMode);

  return (
    <div
      role="group"
      aria-label="Agent mode"
      data-slot="agent-mode-selector"
      className="bg-background inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {AGENT_MODES.map((value) => {
        const Icon = MODE_ICON[value];
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            title={AGENT_MODE_META[value].description}
            onClick={() => setMode(value)}
            className={cn(
              "focus-visible:ring-ring/50 inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-2",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3" aria-hidden />
            {AGENT_MODE_META[value].label}
          </button>
        );
      })}
    </div>
  );
}
