"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { BookOpen, ExternalLink } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  isToolError,
  type DocSearchHit,
  type ReadDocResult,
  type SearchDocsResult,
} from "@/lib/agent/tool-results";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function SourceLink({ url, title }: { url: string; title: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary inline-flex min-w-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
    >
      <span className="truncate">{title}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Citation({ hit, index }: { hit: DocSearchHit; index: number }) {
  return (
    <li className="bg-background flex min-w-0 gap-2.5 rounded-lg border p-2.5">
      <span
        aria-hidden
        className="bg-muted text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded font-mono text-[11px]"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SourceLink url={hit.url} title={hit.title} />
          {hit.section ? <Pill>{hit.section}</Pill> : null}
        </div>
        <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
          {pathOf(hit.url)}
        </p>
        <p className="text-muted-foreground mt-1 line-clamp-3 text-xs">{hit.excerpt}</p>
      </div>
    </li>
  );
}

export const SearchDocsToolUI: ToolCallMessagePartComponent<unknown, SearchDocsResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Searching docs…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard
      slot="agent-doc-sources"
      title="Documentation"
      subtitle={`${result.results.length} source(s) from docs.liara.ir`}
      icon={BookOpen}
      collapsible
      defaultOpen={false}
      summary={
        result.results.length > 0 ? (
          <ol aria-label="Sources" className="flex flex-wrap gap-1.5">
            {result.results.map((hit, index) => (
              <li key={hit.url} className="min-w-0 max-w-full">
                <a
                  href={hit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={hit.title}
                  className="bg-muted text-muted-foreground hover:text-foreground inline-flex max-w-56 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                >
                  <span className="font-mono text-[10px]">{index + 1}</span>
                  <span className="truncate">{hit.title}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : null
      }
    >
      {result.results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No matching pages.</p>
      ) : (
        <ol aria-label="Sources" className="flex flex-col gap-2">
          {result.results.map((hit, index) => (
            <Citation key={hit.url} hit={hit} index={index} />
          ))}
        </ol>
      )}
    </ToolCard>
  );
};

const previewComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  img: () => null,
};

export const ReadDocToolUI: ToolCallMessagePartComponent<unknown, ReadDocResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Reading page…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard
      slot="agent-doc-source"
      title={result.title}
      subtitle={pathOf(result.url)}
      icon={BookOpen}
      collapsible
      defaultOpen={false}
    >
      <SourceLink url={result.url} title={result.title} />
      <p className="text-muted-foreground mt-1 text-xs">
        {result.truncated ? "Preview: first part of the page." : "Full page."}
      </p>
      <article
        aria-label="Page preview"
        className="bg-background mt-2 max-h-96 overflow-auto rounded-lg border p-3 text-sm leading-relaxed break-words [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-2 [&_pre]:bg-muted [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-2.5 [&_pre]:font-mono [&_pre]:text-xs [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_code]:font-mono [&_code]:text-xs"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
          {result.markdown}
        </ReactMarkdown>
      </article>
    </ToolCard>
  );
};
