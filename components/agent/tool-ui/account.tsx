"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CreditCard } from "lucide-react";
import { isToolError, type AccountPlansResult } from "@/lib/agent/tool-results";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export const AccountPlansToolUI: ToolCallMessagePartComponent<unknown, AccountPlansResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading plans…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  const plans = asRecord(result.plans);
  const projects = asRecord(plans?.projects);
  const bundles = asRecord(plans?.projectBundlePlans);
  const rows = projects
    ? Object.entries(projects).map(([id, plan]) => {
        const available = asRecord(plan)?.available;
        return { id, available: typeof available === "boolean" ? available : undefined };
      })
    : [];

  return (
    <ToolCard
      slot="agent-account-plans"
      title="Plans"
      subtitle={rows.length > 0 ? `${rows.length} app plans` : "As returned by Liara"}
      icon={CreditCard}
      collapsible
      defaultOpen={false}
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-start text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Plan
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Availability
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs break-all">{row.id}</td>
                  <td className="px-3 py-2">
                    {row.available === undefined ? (
                      <span className="text-muted-foreground text-xs">Not reported</span>
                    ) : (
                      <Pill tone={row.available ? "success" : "neutral"}>
                        {row.available ? "Available" : "Unavailable"}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Plan details came back in a format this view does not show.
        </p>
      )}
      {bundles && Object.keys(bundles).length > 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Bundle plan groups: {Object.keys(bundles).length}
        </p>
      ) : null}
    </ToolCard>
  );
};
