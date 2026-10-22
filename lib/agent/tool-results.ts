export type ToolErrorResult = {
  error: string;
  /** Set when Liara itself answered with an error. */
  status?: number | null;
  liaraResponse?: { message?: string; errors?: string; raw?: string } | null;
  request?: { method: string; path: string } | null;
};

export type WaitForLiaraResult =
  | {
      done: boolean;
      timedOut: boolean;
      /** Why the wait ended: matched the target value, left the pending set, or timed out. */
      reason: "matched" | "left_pending" | "timeout";
      attempts: number;
      value: unknown;
      path: string;
      field?: string;
    }
  | ToolErrorResult;

export type ProjectSummaryResult = {
  name: string;
  type?: string;
  status?: string;
  scale?: number;
  planID?: string;
  isDeployed?: boolean;
  createdAt?: string;
};

export type ListProjectsResult = { projects: ProjectSummaryResult[] } | ToolErrorResult;

export type GetProjectResult =
  | {
      name: string;
      type?: string;
      status?: string;
      scale?: number;
      planID?: string;
      isDeployed?: boolean;
      createdAt?: string;
      node: { id?: string; ip?: string } | null;
      envKeys: Array<{ key: string; encrypted: boolean }>;
      envValues: "hidden";
    }
  | ToolErrorResult;

export type LogLineResult = { time?: string; type?: string; message: string };

export type GetLogsResult =
  | {
      name: string;
      since: string;
      count: number;
      truncated: boolean;
      lines: LogLineResult[];
      releaseID?: string;
      release?: { state?: string; failReason?: string; queue?: number };
    }
  | ToolErrorResult;

export type MetricSeriesResult = Array<{
  points: number;
  latest: unknown;
  applet?: string;
}>;

export type MetricPartResult<T> = T | ToolErrorResult;

export type GetMetricsResult =
  | {
      name: string;
      summary: MetricPartResult<{
        cpuUsage: MetricSeriesResult;
        memoryUsage: MetricSeriesResult;
      }>;
      cpu: MetricPartResult<{ series: MetricSeriesResult }>;
      memory: MetricPartResult<{ series: MetricSeriesResult }>;
    }
  | ToolErrorResult;

export type ReleaseResult = {
  id?: string;
  state?: string;
  tag?: string;
  createdAt?: string;
  finishedAt?: string;
  branch?: string | null;
  commit?: string | null;
  commitMessage?: string | null;
};

export type ListReleasesResult =
  | { name: string; currentRelease?: string; total?: number; releases: ReleaseResult[] }
  | ToolErrorResult;

export type EventResult = { metaData?: Record<string, unknown>; values: string[][] };

export type EventsResult = { name: string; events: EventResult[] } | ToolErrorResult;

export type AccountPlansResult =
  | { plans: unknown; databaseVersions?: unknown }
  | ToolErrorResult;

export type DocSearchHit = {
  title: string;
  url: string;
  section?: string;
  excerpt: string;
};

export type SearchDocsResult = { results: DocSearchHit[] } | ToolErrorResult;

export type ReadDocResult =
  | { title: string; url: string; markdown: string; truncated: boolean }
  | ToolErrorResult;

export type FindingResult = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  summary: string;
  projectName: string;
  serviceName: string | null;
  status: "new" | "ongoing" | "resolved";
  ruleId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence?: Array<{ label: string; value: string }>;
};

export type ListFindingsResult = { findings: FindingResult[] } | ToolErrorResult;

export type GetFindingResult = { finding: FindingResult } | ToolErrorResult;

export type HealthCheckResult =
  | { runId: string; status: string; projectsChecked: number; error?: string }
  | ToolErrorResult;

export type FixPromptResult =
  | {
      prompt: string;
      warnings: string[];
      target: string;
      sources: Array<{ title: string; url: string }>;
    }
  | ToolErrorResult;

export type WriteResult = { ok: true; summary: string } | ToolErrorResult;

export type AskUserResult = { answers: Record<string, string> };

export type ArchitectureResult = { shown: true; nodeCount: number; edgeCount: number };

export const ARCHITECTURE_KINDS = [
  "app",
  "database",
  "object-storage",
  "domain",
  "email",
  "cache",
  "other",
] as const;

export type ArchitectureKind = (typeof ARCHITECTURE_KINDS)[number];

export function isToolError(result: unknown): result is ToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  );
}

export type DomainResult = {
  id?: string;
  name?: string;
  status?: string;
  certificatesStatus?: string;
  cnameRecord?: string;
};

export type ListDomainsResult = { name: string; domains: DomainResult[] } | ToolErrorResult;

export type DeployResult =
  | {
      ok: true;
      summary: string;
      name: string;
      releaseID?: string;
      sourceID?: string;
      port: number;
      platform: string;
    }
  | ToolErrorResult;

export type DeployPromptResult =
  | { prompt: string; target: string; appName: string }
  | ToolErrorResult;

export type WaitForReleaseResult =
  | {
      done: boolean;
      succeeded: boolean;
      state: string;
      failReason?: string;
      releaseID: string;
      attempts: number;
      buildTail: Array<{ time?: string; type: string; message: string }>;
    }
  | ToolErrorResult;
