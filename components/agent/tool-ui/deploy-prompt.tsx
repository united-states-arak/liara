"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Check, ClipboardCopy, Rocket } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { isToolError, type DeployPromptResult } from "@/lib/agent/tool-results";
import { ToolCard, ToolError, ToolRunning } from "./shared";

export const DeployPromptToolUI: ToolCallMessagePartComponent<unknown, DeployPromptResult> = ({
  result,
  status,
}) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Writing deploy prompt…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;
  return (
    <ToolCard
      slot="agent-deploy-prompt"
      title="Deploy prompt"
      subtitle={`${result.appName} · ${result.target}`}
      icon={Rocket}
      action={
        <button
          type="button"
          onClick={() => copyToClipboard(result.prompt)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
        >
          {isCopied ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
          <span role="status">{isCopied ? "Copied" : "Copy prompt"}</span>
        </button>
      }
    >
      <pre
        tabIndex={0}
        dir="ltr"
        className="bg-muted max-h-72 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap"
      >
        {result.prompt}
      </pre>
    </ToolCard>
  );
};
