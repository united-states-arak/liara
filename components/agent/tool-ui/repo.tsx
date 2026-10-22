"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { FileCode2, FolderGit2 } from "lucide-react";
import { isToolError, type ToolErrorResult } from "@/lib/agent/tool-results";
import type { RepoInspection } from "@/lib/agent/repo-inspect";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

export const InspectRepoToolUI: ToolCallMessagePartComponent<
  { sourceUrl?: string },
  RepoInspection | ToolErrorResult
> = ({ args, result, status }) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Looking through the code…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  const d = result.detected;
  return (
    <ToolCard
      slot="agent-repo"
      title="Code inspected"
      subtitle={args.sourceUrl}
      icon={FolderGit2}
      collapsible
      defaultOpen
      action={<Pill tone="info">{result.hint.platform}{result.hint.port ? `:${result.hint.port}` : ""}</Pill>}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {d.framework || d.language ? (
          <>
            <dt className="text-muted-foreground">Built with</dt>
            <dd>{[d.framework, d.language].filter(Boolean).join(" · ")}</dd>
          </>
        ) : null}
        {d.packageManager ? (
          <>
            <dt className="text-muted-foreground">Package manager</dt>
            <dd>{d.packageManager}</dd>
          </>
        ) : null}
        {d.databases.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Needs</dt>
            <dd>{d.databases.join(", ")}</dd>
          </>
        ) : null}
        {d.envExampleKeys.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Settings</dt>
            <dd className="font-mono break-words" dir="ltr">{d.envExampleKeys.join(", ")}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Dockerfile</dt>
        <dd>{d.hasDockerfile ? "included" : "none"}</dd>
        <dt className="text-muted-foreground">Plan</dt>
        <dd>{result.hint.why}</dd>
      </dl>
    </ToolCard>
  );
};

export const ReadRepoFileToolUI: ToolCallMessagePartComponent<
  { path?: string },
  { path: string; content: string; truncated: boolean } | ToolErrorResult
> = ({ args, result, status }) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Reading a file…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  return (
    <ToolCard
      slot="agent-repo-file"
      title={args.path ?? result.path}
      subtitle={result.truncated ? "first part of the file" : "file"}
      icon={FileCode2}
      collapsible
      defaultOpen={false}
    >
      <pre dir="ltr" tabIndex={0} className="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
        {result.content}
      </pre>
    </ToolCard>
  );
};
