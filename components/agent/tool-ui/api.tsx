"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Braces, Hourglass, Search } from "lucide-react";
import { isToolError, type ToolErrorResult, type WaitForLiaraResult, type WaitForReleaseResult } from "@/lib/agent/tool-results";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

type Hit = { service: string; method: string; path: string; summary: string };
type SearchResult = { results: Hit[] } | ToolErrorResult;

export const ApiSearchToolUI: ToolCallMessagePartComponent<{ query?: string }, SearchResult> = ({
  args,
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Searching the Liara API…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;
  return (
    <ToolCard slot="agent-api-search" title="Liara API" subtitle={args.query} icon={Search} collapsible defaultOpen={false}>
      {result.results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No matching endpoints.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs">
          {result.results.map((hit) => (
            <li key={`${hit.method}${hit.service}${hit.path}`} className="flex flex-wrap items-center gap-2" dir="ltr">
              <Pill tone={hit.method === "GET" ? "info" : "warning"}>{hit.method}</Pill>
              <span className="font-mono">{hit.path}</span>
              <span className="text-muted-foreground">{hit.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
};

const SECRET_KEY = /pass|secret|token|key|credential/i;

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEY.test(key) && typeof child === "string" ? "hidden" : mask(child),
      ]),
    );
  }
  return value;
}

export const ApiGetToolUI: ToolCallMessagePartComponent<{ service?: string; path?: string }, unknown> = ({
  args,
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Calling the Liara API…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  return (
    <ToolCard slot="agent-api-get" title="Liara API" subtitle={`GET ${args.path ?? ""}`} icon={Braces} collapsible defaultOpen={false}>
      <pre dir="ltr" tabIndex={0} className="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
        {JSON.stringify(mask(result), null, 2)}
      </pre>
    </ToolCard>
  );
};

export const WaitForLiaraToolUI: ToolCallMessagePartComponent<
  { path?: string; field?: string; equals?: string | number | boolean },
  WaitForLiaraResult
> = ({ args, result, status }) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Waiting for Liara… this can take up to a minute." /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  const tone = result.done ? "success" : "warning";
  const label = result.done ? "Ready" : "Still working";
  const shown = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
  return (
    <ToolCard
      slot="agent-wait"
      title="Waiting for Liara"
      subtitle={args.path}
      icon={Hourglass}
      action={<Pill tone={tone}>{label}</Pill>}
    >
      <p className="text-muted-foreground text-xs">
        {result.done
          ? `Done after ${result.attempts} check${result.attempts === 1 ? "" : "s"}.`
          : "It was not ready yet after about 45 seconds. The assistant can check again."}
        {shown ? ` Current value: ${shown}` : ""}
      </p>
    </ToolCard>
  );
};

export const WaitForReleaseToolUI: ToolCallMessagePartComponent<
  { name?: string },
  WaitForReleaseResult
> = ({ args, result, status }) => {
  if (result === undefined) {
    return status.type === "running" ? (
      <ToolRunning label="Waiting for the build to finish… this can take up to a minute." />
    ) : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  const tone = result.succeeded ? "success" : result.done ? "danger" : "warning";
  const label = result.succeeded ? "Deployed" : result.done ? result.state : "Still building";
  return (
    <ToolCard
      slot="agent-wait-release"
      title="Deploy status"
      subtitle={args.name}
      icon={Hourglass}
      action={<Pill tone={tone}>{label}</Pill>}
    >
      {result.failReason ? <p className="text-destructive mb-2 text-xs">{result.failReason}</p> : null}
      {result.buildTail.length > 0 ? (
        <pre dir="ltr" tabIndex={0} className="bg-muted max-h-56 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
          {result.buildTail.map((line) => line.message).join("\n")}
        </pre>
      ) : null}
    </ToolCard>
  );
};

export const ApiBatchToolUI: ToolCallMessagePartComponent<{ calls?: Array<{ path?: string }> }, unknown> = ({
  args,
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Reading from Liara…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} result={result} />;
  return (
    <ToolCard
      slot="agent-api-batch"
      title="Liara API"
      subtitle={`${args.calls?.length ?? 0} reads`}
      icon={Braces}
      collapsible
      defaultOpen={false}
    >
      <pre dir="ltr" tabIndex={0} className="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
        {JSON.stringify(mask(result), null, 2)}
      </pre>
    </ToolCard>
  );
};
