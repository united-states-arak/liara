export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type RunStatus = "running" | "ok" | "partial" | "failed" | "skipped";
export type RunTrigger = "scheduled" | "manual";
export type FindingStatus = "new" | "ongoing" | "resolved";
export type FixTarget = "claude-code" | "cursor" | "codex" | "generic";
export type ResourceKind =
  | "app"
  | "database"
  | "bucket"
  | "vm"
  | "ai_workspace"
  | "mail_server"
  | "dns_zone";

export type SeverityCounts = Record<Severity, number>;

export type RunRow = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  error: string | null;
  projectsChecked: number;
  startedAt: string;
  finishedAt: string | null;
};

export type FindingRow = {
  id: string;
  ruleId: string;
  kind: ResourceKind;
  projectName: string;
  serviceName: string | null;
  severity: Severity;
  title: string;
  summary: string;
  evidence: Array<{ label: string; value: string }>;
  status: FindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

export type ScheduleInfo = {
  intervalMs: number;
  lastScheduledAt: string | null;
  nextRunAt: string | null;
  due: boolean;
  running: boolean;
  scheduler: {
    status: "running" | "disabled" | "not-started";
    reason: string | null;
    startedAt: number | null;
    lastTickAt: number | null;
  };
};

export type ChecksOverview = {
  lastRun: RunRow | null;
  nextRunAt: string | null;
  intervalMinutes: number;
  schedule: ScheduleInfo;
  tokenConfigured: boolean;
  activeFindingCounts: SeverityCounts;
  taggedCount: number;
};

export type ChecksResponse = {
  overview: ChecksOverview;
  findings: FindingRow[];
  runs: RunRow[];
};

export type RunCheckResponse = {
  runId: string;
  status: RunStatus;
  projectsChecked: number;
  error?: string | null;
};

export type FixPromptResponse = {
  prompt: string;
  docs: Array<{ title: string; url: string; excerpt: string }>;
  warnings: string[];
};
