"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Activity } from "lucide-react";
import {
  isToolError,
  type GetMetricsResult,
  type MetricSeriesResult,
  type ToolErrorResult,
} from "@/lib/agent/tool-results";
import { Pill, safeMessage, ToolCard, ToolError, ToolRunning } from "./shared";

const RAW_CHARS = 80;

function latestText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(" · ")
    : JSON.stringify(value);
  return text.length > RAW_CHARS ? `${text.slice(0, RAW_CHARS)}…` : text;
}

function SeriesTable({
  title,
  rows,
  error,
}: {
  title: string;
  rows?: MetricSeriesResult;
  error?: ToolErrorResult;
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-muted-foreground mb-1 text-xs font-medium">{title}</h4>
      {error ? (
        <p className="text-destructive text-xs" role="status">
          {safeMessage(error) ?? "Could not load this metric."}
        </p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">No data returned.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-start text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="px-2.5 py-1.5 font-medium">
                  Applet
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium">
                  Points
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium">
                  Latest
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.applet ?? "series"}-${index}`} className="border-t">
                  <td className="px-2.5 py-1.5">
                    {row.applet ? <Pill>{row.applet}</Pill> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono tabular-nums">{row.points}</td>
                  <td className="px-2.5 py-1.5 font-mono break-all">{latestText(row.latest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const MetricsCardToolUI: ToolCallMessagePartComponent<unknown, GetMetricsResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Fetching metrics…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  const { summary, cpu, memory } = result;
  const summaryOk = isToolError(summary) ? undefined : summary;
  const summaryError = isToolError(summary) ? summary : undefined;
  const cpuOk = isToolError(cpu) ? undefined : cpu;
  const memoryOk = isToolError(memory) ? undefined : memory;

  return (
    <ToolCard
      slot="agent-metrics"
      title={`Metrics · ${result.name}`}
      subtitle="Latest values as returned by Liara"
      icon={Activity}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SeriesTable title="Summary CPU" rows={summaryOk?.cpuUsage} error={summaryError} />
        <SeriesTable title="Summary memory" rows={summaryOk?.memoryUsage} error={summaryError} />
        <SeriesTable
          title="CPU, last hour"
          rows={cpuOk?.series}
          error={isToolError(cpu) ? cpu : undefined}
        />
        <SeriesTable
          title="Memory, last hour"
          rows={memoryOk?.series}
          error={isToolError(memory) ? memory : undefined}
        />
      </div>
    </ToolCard>
  );
};
