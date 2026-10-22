import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchFixPrompt } from "./api";
import { copyText } from "./clipboard";
import { useFlash } from "./hooks";
import type { FindingRow, FixTarget } from "./types";

const TARGETS: Array<{ value: FixTarget; label: string }> = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "codex", label: "Codex" },
  { value: "generic", label: "Generic" },
];

type PromptRequest = {
  target: FixTarget;
  extraContext: string;
  attempt: number;
};

export function FixPromptDialog({
  finding,
  open,
  onOpenChange,
}: {
  finding: FindingRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fix prompt</DialogTitle>
          <DialogDescription>
            {finding.projectName}
            {finding.serviceName ? ` / ${finding.serviceName}` : ""}: {finding.title}
          </DialogDescription>
        </DialogHeader>
        <FixPromptBody finding={finding} />
      </DialogContent>
    </Dialog>
  );
}

function FixPromptBody({ finding }: { finding: FindingRow }) {
  const contextId = useId();
  const [draftContext, setDraftContext] = useState("");
  const [request, setRequest] = useState<PromptRequest>({
    target: "claude-code",
    extraContext: "",
    attempt: 0,
  });
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, flashCopied] = useFlash(2000);

  const prompt = useQuery({
    queryKey: ["finding-fix-prompt", finding.id, request],
    queryFn: () =>
      fetchFixPrompt(finding.id, {
        target: request.target,
        extraContext: request.extraContext,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = prompt.data;
  const isGenerating = prompt.isPending || prompt.isFetching;

  function selectTarget(target: FixTarget) {
    setRequest((current) => ({ ...current, target }));
  }

  function regenerate() {
    setRequest((current) => ({
      target: current.target,
      extraContext: draftContext.trim(),
      attempt: current.attempt + 1,
    }));
  }

  async function handleCopy() {
    if (!data?.prompt) return;
    const ok = await copyText(data.prompt);
    if (ok) {
      setCopyError(null);
      flashCopied();
    } else {
      setCopyError("Copy was blocked. Select the prompt text and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium" id={`${contextId}-target`}>
          Target
        </p>
        <div
          role="group"
          aria-labelledby={`${contextId}-target`}
          className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {TARGETS.map((target) => {
            const selected = request.target === target.value;
            return (
              <button
                key={target.value}
                type="button"
                aria-pressed={selected}
                onClick={() => selectTarget(target.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {target.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={contextId} className="text-sm font-medium">
          Extra context <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={contextId}
          rows={3}
          value={draftContext}
          onChange={(event) => setDraftContext(event.target.value)}
          placeholder="Anything the coding agent should know, for example which service owns this code."
        />
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={regenerate} disabled={isGenerating}>
            {isGenerating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Regenerate
          </Button>
        </div>
      </div>

      {prompt.isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p>Could not generate the prompt.</p>
            <p className="font-mono text-xs break-words">{prompt.error.message}</p>
          </div>
        </div>
      )}

      {data && data.warnings.length > 0 && (
        <div className="space-y-1 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {data.warnings.map((warning, index) => (
            <p key={index} className="flex items-start gap-2">
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Prompt</p>
        {prompt.isPending ? (
          <div className="flex h-48 items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Generating prompt
          </div>
        ) : data ? (
          <pre
            tabIndex={0}
            aria-busy={isGenerating}
            className={cn(
              "max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words transition-opacity",
              isGenerating && "opacity-60",
            )}
          >
            {data.prompt}
          </pre>
        ) : null}
      </div>

      {data && data.docs.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Documented sources</p>
          <ul className="space-y-2">
            {data.docs.map((doc) => (
              <li key={doc.url} className="space-y-0.5">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm underline underline-offset-4 hover:text-muted-foreground"
                >
                  {doc.title}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
                {doc.excerpt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{doc.excerpt}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs text-muted-foreground sm:mr-auto">
          {copyError ? (
            <span className="text-red-600 dark:text-red-400">{copyError}</span>
          ) : copied ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden />
              Prompt copied to clipboard
            </span>
          ) : null}
        </p>
        <Button onClick={handleCopy} disabled={!data?.prompt} size="lg">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
      </DialogFooter>
    </div>
  );
}
