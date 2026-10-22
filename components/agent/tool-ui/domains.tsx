"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Globe } from "lucide-react";
import { isToolError, type ListDomainsResult } from "@/lib/agent/tool-results";
import { Pill, ToolCard, ToolError } from "./shared";

export const DomainsToolUI: ToolCallMessagePartComponent<unknown, ListDomainsResult> = ({
  result,
}) => {
  if (result === undefined) return null;
  if (isToolError(result)) return <ToolError message={result.error} />;
  return (
    <ToolCard slot="agent-domains" title="Domains" subtitle={result.name} icon={Globe}>
      {result.domains.length === 0 ? (
        <p className="text-muted-foreground text-sm">No domains yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {result.domains.map((domain) => (
            <li key={domain.id ?? domain.name} className="flex flex-wrap items-center gap-2">
              <span className="font-mono" dir="ltr">
                {domain.name}
              </span>
              {domain.status ? <Pill tone="neutral">{domain.status}</Pill> : null}
              {domain.certificatesStatus ? (
                <Pill tone="neutral">SSL: {domain.certificatesStatus}</Pill>
              ) : null}
              {domain.cnameRecord ? (
                <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                  CNAME {domain.cnameRecord}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
};
