"use client";

import { InfoIcon } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import { getThreadMessageTokenUsage } from "@assistant-ui/ai-sdk";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ROWS = [
  ["inputTokens", "Input"],
  ["cachedInputTokens", "  of which cached"],
  ["outputTokens", "Output"],
  ["reasoningTokens", "  of which reasoning"],
] as const;

const format = (value: number) => value.toLocaleString("en-US");

/** Info button for the assistant action bar: token usage of this reply on hover. */
export function UsageInfoButton() {
  const message = useAuiState((s) => s.message);
  const usage = getThreadMessageTokenUsage(message);
  const custom = (message.metadata as { custom?: { model?: unknown } } | undefined)?.custom;
  const model = typeof custom?.model === "string" ? custom.model : undefined;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Token usage"
              className="aui-button-icon size-6 p-1 active:scale-90"
            />
          }
        >
          <InfoIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="min-w-48">
          {usage ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs" dir="ltr">
              {model ? (
                <>
                  <dt className="opacity-70">Model</dt>
                  <dd className="font-mono">{model}</dd>
                </>
              ) : null}
              {ROWS.map(([key, label]) =>
                usage[key] !== undefined ? (
                  <div key={key} className="contents">
                    <dt className="whitespace-pre opacity-70">{label}</dt>
                    <dd className="text-end font-mono tabular-nums">{format(usage[key])}</dd>
                  </div>
                ) : null,
              )}
              {usage.totalTokens !== undefined ? (
                <>
                  <dt className="font-medium">Total</dt>
                  <dd className="text-end font-mono font-medium tabular-nums">{format(usage.totalTokens)}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <span className="text-xs">No usage reported for this reply.</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
