"use client";

import { Fragment, useMemo } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Archive, Boxes, Cpu, Database, Server, Sparkles, type LucideIcon } from "lucide-react";
import {
  isToolError,
  type GetProjectResult,
  type ListProjectsResult,
  type ProjectSummaryResult,
} from "@/lib/agent/tool-results";
import {
  formatTime,
  KeyValue,
  Pill,
  ToolCard,
  ToolError,
  ToolRunning,
  toneForState,
  type Tone,
} from "./shared";

type ResourceKind = "app" | "database" | "bucket" | "vm" | "ai";

const KIND_ORDER: ResourceKind[] = ["app", "database", "bucket", "vm", "ai"];

const KIND_META: Record<ResourceKind, { label: string; singular: string; icon: LucideIcon }> = {
  app: { label: "Apps", singular: "app", icon: Boxes },
  database: { label: "Databases", singular: "database", icon: Database },
  bucket: { label: "Buckets", singular: "bucket", icon: Archive },
  vm: { label: "Virtual machines", singular: "virtual machine", icon: Cpu },
  ai: { label: "AI workspaces", singular: "AI workspace", icon: Sparkles },
};

const KIND_PATTERNS: Array<[ResourceKind, RegExp]> = [
  ["database", /mongo|mysql|mariadb|postgres|redis|elastic|rabbit|kafka|database|\bdb\b/i],
  ["bucket", /bucket|object|s3|storage/i],
  ["vm", /\bvm\b|virtual|vps|machine/i],
  ["ai", /\bai\b|llm|workspace|gpu/i],
];

/** Liara reports only a `type` string; kinds are inferred from it and default to app. */
function resourceKind(type: string | undefined): ResourceKind {
  if (!type) return "app";
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(type))?.[0] ?? "app";
}

function scaleLabel(scale: number | undefined): { label: string; tone: Tone } {
  if (scale === undefined) return { label: "Unknown", tone: "neutral" };
  return scale > 0 ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" };
}

function groupByKind(projects: ProjectSummaryResult[]) {
  return KIND_ORDER.flatMap((kind) => {
    const rows = projects.filter((project) => resourceKind(project.type) === kind);
    return rows.length > 0 ? [{ kind, rows }] : [];
  });
}

function ProjectRow({ project, icon: Icon }: { project: ProjectSummaryResult; icon: LucideIcon }) {
  const scale = scaleLabel(project.scale);
  return (
    <tr className="border-t align-top">
      <td className="max-w-56 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="truncate font-medium" title={project.name}>
            {project.name}
          </span>
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs">{project.type ?? "—"}</td>
      <td className="px-3 py-2">
        {project.status ? (
          <Pill tone={toneForState(project.status)}>{project.status}</Pill>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <Pill tone={scale.tone}>{scale.label}</Pill>
      </td>
      <td className="px-3 py-2 font-mono text-xs">{project.planID ?? "—"}</td>
      <td className="px-3 py-2 text-xs">
        {project.isDeployed === undefined ? "—" : project.isDeployed ? "Yes" : "No"}
      </td>
    </tr>
  );
}

function ProjectTable({ projects }: { projects: ProjectSummaryResult[] }) {
  const groups = useMemo(() => groupByKind(projects), [projects]);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] border-collapse text-start text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Scale
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Plan
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Deployed
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ kind, rows }) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <Fragment key={kind}>
                <tr className="bg-muted/30 border-t">
                  <th
                    scope="colgroup"
                    colSpan={6}
                    className="px-3 py-1.5 text-start text-xs font-medium"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5" aria-hidden />
                      {meta.label} · {rows.length}
                    </span>
                  </th>
                </tr>
                {rows.map((project) => (
                  <ProjectRow key={project.name} project={project} icon={Icon} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function countsSubtitle(projects: ProjectSummaryResult[]): string {
  const counts = new Map<ResourceKind, number>();
  for (const project of projects) {
    const kind = resourceKind(project.type);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return KIND_ORDER.flatMap((kind) => {
    const count = counts.get(kind);
    if (!count) return [];
    const { singular } = KIND_META[kind];
    return [`${count} ${count === 1 ? singular : `${singular}s`}`];
  }).join(" · ");
}

export const ProjectCardsToolUI: ToolCallMessagePartComponent<unknown, ListProjectsResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading apps…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  return (
    <ToolCard
      slot="agent-project-cards"
      title={`Resources (${result.projects.length})`}
      subtitle={result.projects.length > 0 ? countsSubtitle(result.projects) : undefined}
      icon={Boxes}
    >
      {result.projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">No apps on this account.</p>
      ) : (
        <ProjectTable projects={result.projects} />
      )}
    </ToolCard>
  );
};

export const ProjectDetailToolUI: ToolCallMessagePartComponent<unknown, GetProjectResult> = ({
  result,
  status,
}) => {
  if (result === undefined) {
    return status.type === "running" ? <ToolRunning label="Loading app…" /> : null;
  }
  if (isToolError(result)) return <ToolError message={result.error} />;

  const scale = scaleLabel(result.scale);
  return (
    <ToolCard
      slot="agent-project-detail"
      title={result.name}
      subtitle={result.type}
      icon={Server}
      action={
        result.status ? <Pill tone={toneForState(result.status)}>{result.status}</Pill> : null
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <KeyValue label="Scale" value={scale.label} />
        <KeyValue label="Plan" value={result.planID} />
        <KeyValue
          label="Deployed"
          value={result.isDeployed === undefined ? undefined : result.isDeployed ? "Yes" : "No"}
        />
        <KeyValue label="Node" value={result.node?.ip ?? result.node?.id} />
        <KeyValue label="Created" value={formatTime(result.createdAt)} />
      </dl>
      <div className="mt-3">
        <p className="text-muted-foreground mb-1 text-xs">
          Environment variables: {result.envKeys.length} (values hidden)
        </p>
        {result.envKeys.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {result.envKeys.map((env) => (
              <li key={env.key}>
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {env.key}
                  {env.encrypted ? " · encrypted" : ""}
                </code>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </ToolCard>
  );
};
