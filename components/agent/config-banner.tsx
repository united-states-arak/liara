"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import {
  AI_CONFIG_KEY,
  LIARA_STATUS_KEY,
  requestJson,
  type AiConfig,
  type LiaraStatus,
} from "@/components/settings/settings-api";

export function AgentConfigBanner() {
  const liara = useQuery({
    queryKey: LIARA_STATUS_KEY,
    queryFn: () => requestJson<LiaraStatus>("/api/settings/liara"),
  });
  const ai = useQuery({
    queryKey: AI_CONFIG_KEY,
    queryFn: () => requestJson<AiConfig>("/api/settings/ai"),
  });

  const problems: string[] = [];
  if (liara.data && !liara.data.tokenMask) {
    problems.push("No Liara token is set, so the assistant cannot read or change your apps.");
  } else if (liara.data && !liara.data.connected) {
    problems.push(
      `The Liara token is not working${liara.data.error?.message ? `: ${liara.data.error.message}` : "."}`,
    );
  }
  if (ai.data && !ai.data.hasApiKey) {
    problems.push("No AI API key is set, so the assistant cannot answer.");
  }

  if (problems.length === 0) return null;

  return (
    <div
      role="alert"
      data-slot="agent-config-banner"
      className="flex items-start gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
        <p className="text-xs opacity-80">Open Settings (gear icon, top right) to fix this.</p>
      </div>
    </div>
  );
}
