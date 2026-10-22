import type { ResourceKind } from "@/lib/liara/services";
import type {
  LiaraLogLine,
  LiaraProjectDetails,
  LiaraReleasesResponse,
  LiaraSummaryMetricsResponse,
} from "@/lib/liara/types";
import type { BucketMetrics, DatabaseDetails, VmDetails, WorkspaceDetails } from "./fetch";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type DataSource = "details" | "logs" | "summary" | "releases";
export type Evidence = { label: string; value: string };

export type ResourceSnapshot =
  | {
      kind: "app";
      name: string;
      details?: LiaraProjectDetails;
      logs?: LiaraLogLine[];
      summary?: LiaraSummaryMetricsResponse;
      releases?: LiaraReleasesResponse;
    }
  | {
      kind: "database";
      name: string;
      details?: DatabaseDetails;
      summary?: LiaraSummaryMetricsResponse;
    }
  | { kind: "vm"; name: string; details?: VmDetails }
  | { kind: "ai_workspace"; name: string; details?: WorkspaceDetails }
  | { kind: "bucket"; name: string; metrics?: BucketMetrics };

export interface RuleFinding {
  ruleId: string;
  serviceName: string | null;
  severity: Severity;
  title: string;
  summary: string;
  evidence: Evidence[];
}

export interface CheckRule {
  id: string;
  kind: ResourceKind;
  title: string;
  severity: Severity;
  requires: DataSource[];
  /** Set when the check cannot be run with the data the API documents. */
  skipReason?: string;
  evaluate(snapshot: ResourceSnapshot): RuleFinding[];
}

const LOG_ERROR_PATTERN =
  /\b(5\d\d|panic|fatal|out of memory|OOMKilled|ECONNREFUSED|EADDRINUSE|unhandled|exception)\b/i;
const LOG_HIGH_PATTERN = /\b(panic|fatal|out of memory|OOMKilled)\b/i;
const MAX_EXCERPT_LINES = 8;
const MAX_EXCERPT_CHARS = 300;

// Releases.state is an untyped string in data/liara-api/paas.yaml (schema Releases, ~line 1872),
// and no page in data/liara-docs/llms names its values, so no state is treated as failed.
// Add values here only after a doc page names them, and cite that page.
const DOCUMENTED_FAILED_RELEASE_STATES: ReadonlySet<string> = new Set<string>();

const text = (value: unknown): string =>
  value === undefined || value === null ? "unknown" : String(value);

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function usageFinding(
  ruleId: string,
  name: string,
  summary: LiaraSummaryMetricsResponse | undefined,
): RuleFinding[] {
  const cpu = summary?.cpuUsage ?? [];
  const memory = summary?.memoryUsage ?? [];
  if (cpu.length === 0 && memory.length === 0) return [];
  return [
    {
      ruleId,
      serviceName: null,
      severity: "info",
      title: "Resource usage snapshot",
      summary: `Latest CPU and memory usage reported for "${name}". No threshold is applied because plan limits are not verified.`,
      evidence: [
        ...cpu.map((item) => ({
          label: `CPU${item.applet ? ` (${item.applet})` : ""} raw value`,
          value: JSON.stringify(item.value),
        })),
        ...memory.map((item) => ({
          label: `Memory${item.applet ? ` (${item.applet})` : ""} raw value`,
          value: JSON.stringify(item.value),
        })),
      ],
    },
  ];
}

const appNotDeployed: CheckRule = {
  id: "app-not-deployed",
  kind: "app",
  title: "App is not deployed",
  severity: "medium",
  requires: ["details"],
  evaluate(snapshot) {
    if (snapshot.kind !== "app") return [];
    const { name, details } = snapshot;
    if (!details || details.isDeployed !== false) return [];
    return [
      {
        ruleId: "app-not-deployed",
        serviceName: null,
        severity: "medium",
        title: "App is not deployed",
        summary: `Liara reports no active deployment for "${name}".`,
        evidence: [
          { label: "isDeployed", value: "false" },
          { label: "Status", value: text(details.status) },
          { label: "Plan", value: text(details.planID) },
        ],
      },
    ];
  },
};

const appStopped: CheckRule = {
  id: "app-stopped",
  kind: "app",
  title: "App is stopped",
  severity: "low",
  requires: ["details"],
  evaluate(snapshot) {
    if (snapshot.kind !== "app") return [];
    const { name, details } = snapshot;
    if (!details || details.scale !== 0) return [];
    return [
      {
        ruleId: "app-stopped",
        serviceName: null,
        severity: "low",
        title: "App is stopped (scale 0)",
        summary: `"${name}" is scaled to 0 and is not serving traffic. This is only a problem if it was not stopped on purpose.`,
        evidence: [
          { label: "scale", value: "0" },
          { label: "Status", value: text(details.status) },
        ],
      },
    ];
  },
};

const appReleaseFailed: CheckRule = {
  id: "app-release-failed",
  kind: "app",
  title: "Latest release failed",
  severity: "high",
  requires: ["releases"],
  skipReason:
    "Releases.state values are not documented in the Liara API spec, so release failure is not checked.",
  evaluate(snapshot) {
    if (snapshot.kind !== "app") return [];
    const { name, releases } = snapshot;
    if (!releases || DOCUMENTED_FAILED_RELEASE_STATES.size === 0) return [];
    const current = releases.releases.find((release) => release._id === releases.currentRelease);
    if (!current?.state || !DOCUMENTED_FAILED_RELEASE_STATES.has(current.state)) {
      return [];
    }
    return [
      {
        ruleId: "app-release-failed",
        serviceName: null,
        severity: "high",
        title: "Latest release failed",
        summary: `The current release of "${name}" is in state "${current.state}".`,
        evidence: [
          { label: "Release state", value: current.state },
          { label: "Release tag", value: text(current.tag) },
          { label: "Created at", value: text(current.createdAt) },
        ],
      },
    ];
  },
};

const appLogErrors: CheckRule = {
  id: "app-log-errors",
  kind: "app",
  title: "Error patterns in recent logs",
  severity: "medium",
  requires: ["logs"],
  evaluate(snapshot) {
    if (snapshot.kind !== "app") return [];
    const { name, logs } = snapshot;
    const matching = (logs ?? []).filter(
      (line): line is LiaraLogLine & { message: string } =>
        typeof line.message === "string" && LOG_ERROR_PATTERN.test(line.message),
    );
    if (matching.length === 0) return [];

    const patterns = new Set<string>();
    for (const line of matching) {
      for (const match of line.message.matchAll(new RegExp(LOG_ERROR_PATTERN.source, "gi"))) {
        patterns.add(match[0].toLowerCase());
      }
    }
    const severity: Severity = matching.some((line) => LOG_HIGH_PATTERN.test(line.message))
      ? "high"
      : "medium";
    const patternList = [...patterns].join(", ");

    return [
      {
        ruleId: "app-log-errors",
        serviceName: null,
        severity,
        title: "Error patterns in recent logs",
        summary: `${matching.length} log line(s) in the last hour matched error patterns (${patternList}) in "${name}".`,
        evidence: [
          { label: "Matching lines (last hour)", value: String(matching.length) },
          { label: "Patterns", value: patternList },
          ...matching.slice(0, MAX_EXCERPT_LINES).map((line, index) => ({
            label: `Log excerpt ${index + 1}`,
            value: truncate(line.message.replace(/\s*\n\s*/g, " | ").trim(), MAX_EXCERPT_CHARS),
          })),
        ],
      },
    ];
  },
};

const appResourceUsage: CheckRule = {
  id: "app-resource-usage",
  kind: "app",
  title: "Resource usage reported",
  severity: "info",
  requires: ["summary"],
  evaluate(snapshot) {
    if (snapshot.kind !== "app") return [];
    return usageFinding("app-resource-usage", snapshot.name, snapshot.summary);
  },
};

// DB-details.status is an untyped string and no expected state is documented, so a
// "not running" check cannot be derived from the API.
const dbNotRunning: CheckRule = {
  id: "db-not-running",
  kind: "database",
  title: "Database is not running",
  severity: "high",
  requires: ["details"],
  skipReason:
    "DB-details.status is an untyped string in data/liara-api/dbaas.yaml and no expected running state is documented, so non-running databases cannot be identified.",
  evaluate: () => [],
};

// The events schema (dbaas.yaml, getDatabaseEvents) has metaData and string-array values only.
// No level or error field is documented, so error entries cannot be identified.
const dbErrorEvents: CheckRule = {
  id: "db-error-events",
  kind: "database",
  title: "Database events report errors",
  severity: "high",
  requires: ["details"],
  skipReason:
    "GET /v1/databases/{name}/events (data/liara-api/dbaas.yaml, getDatabaseEvents) has no documented error or level field, so error entries cannot be identified.",
  evaluate: () => [],
};

const dbPoweredOff: CheckRule = {
  id: "db-powered-off",
  kind: "database",
  title: "Database is powered off",
  severity: "low",
  requires: ["details"],
  evaluate(snapshot) {
    if (snapshot.kind !== "database") return [];
    const { name, details } = snapshot;
    if (!details || details.scale !== 0) return [];
    return [
      {
        ruleId: "db-powered-off",
        serviceName: null,
        severity: "low",
        title: "Database is powered off (scale 0)",
        summary: `"${name}" is scaled to 0 (powered off). This is only a problem if it was not powered off on purpose.`,
        evidence: [
          { label: "scale", value: "0" },
          { label: "Status", value: text(details.status) },
          { label: "Type", value: text(details.type) },
        ],
      },
    ];
  },
};

const dbResourceUsage: CheckRule = {
  id: "db-resource-usage",
  kind: "database",
  title: "Resource usage reported",
  severity: "info",
  requires: ["summary"],
  evaluate(snapshot) {
    if (snapshot.kind !== "database") return [];
    return usageFinding("db-resource-usage", snapshot.name, snapshot.summary);
  },
};

const vmPoweredOff: CheckRule = {
  id: "vm-powered-off",
  kind: "vm",
  title: "VM is powered off",
  severity: "low",
  requires: ["details"],
  evaluate(snapshot) {
    if (snapshot.kind !== "vm") return [];
    const { name, details } = snapshot;
    if (!details || details.power !== "POWERED_OFF") return [];
    return [
      {
        ruleId: "vm-powered-off",
        serviceName: null,
        severity: "low",
        title: "VM is powered off",
        summary: `VM "${name}" reports power POWERED_OFF. This is only a problem if it was not powered off on purpose.`,
        evidence: [
          { label: "Power", value: text(details.power) },
          { label: "State", value: text(details.state) },
          { label: "Plan", value: text(details.plan) },
        ],
      },
    ];
  },
};

const aiWorkspaceFrozen: CheckRule = {
  id: "ai-workspace-frozen",
  kind: "ai_workspace",
  title: "AI workspace is frozen",
  severity: "medium",
  requires: ["details"],
  evaluate(snapshot) {
    if (snapshot.kind !== "ai_workspace") return [];
    const { name, details } = snapshot;
    if (!details || details.state !== "FROZEN") return [];
    return [
      {
        ruleId: "ai-workspace-frozen",
        serviceName: null,
        severity: "medium",
        title: "AI workspace is frozen",
        summary: `AI workspace "${name}" is in state FROZEN. The documented unfreeze action needs enough balance for the plan's hourly price.`,
        evidence: [
          { label: "State", value: text(details.state) },
          { label: "Plan", value: text(details.plan) },
          { label: "Updated at", value: text(details.updatedAt) },
        ],
      },
    ];
  },
};

const aiWorkspacePlan: CheckRule = {
  id: "ai-workspace-plan",
  kind: "ai_workspace",
  title: "AI workspace plan needs attention",
  severity: "medium",
  requires: ["details"],
  skipReason:
    "The AI workspaces spec (https://developers.liara.ir/spec/ai-workspaces.yaml) lists plan values base, standard and pro only. No plan problem state is documented.",
  evaluate: () => [],
};

const bucketUsage: CheckRule = {
  id: "bucket-usage",
  kind: "bucket",
  title: "Bucket usage reported",
  severity: "info",
  requires: ["summary"],
  evaluate(snapshot) {
    if (snapshot.kind !== "bucket") return [];
    const { name, metrics } = snapshot;
    if (!metrics || (!metrics.totalObjects && !metrics.totalBytes)) return [];
    const evidence: Evidence[] = [];
    if (metrics.totalObjects) {
      evidence.push({ label: "Total objects (raw)", value: JSON.stringify(metrics.totalObjects) });
    }
    if (metrics.totalBytes) {
      evidence.push({ label: "Total bytes (raw)", value: JSON.stringify(metrics.totalBytes) });
    }
    return [
      {
        ruleId: "bucket-usage",
        serviceName: null,
        severity: "info",
        title: "Bucket usage snapshot",
        summary: `Latest object count and size reported for bucket "${name}". No threshold is applied because plan limits are not verified.`,
        evidence,
      },
    ];
  },
};

// No mail or DNS health or metrics endpoint is documented in data/liara-api or data/liara-docs.
const mailServerHealth: CheckRule = {
  id: "mail-server-health",
  kind: "mail_server",
  title: "Mail server health",
  severity: "medium",
  requires: [],
  skipReason:
    "No mail server health or metrics endpoint is documented in data/liara-api or data/liara-docs, so mail servers are not checked.",
  evaluate: () => [],
};

const dnsZoneHealth: CheckRule = {
  id: "dns-zone-health",
  kind: "dns_zone",
  title: "DNS zone health",
  severity: "medium",
  requires: [],
  skipReason:
    "No DNS zone health or metrics endpoint is documented in data/liara-api or data/liara-docs, so DNS zones are not checked.",
  evaluate: () => [],
};

export const RULES: readonly CheckRule[] = [
  appNotDeployed,
  appStopped,
  appReleaseFailed,
  appLogErrors,
  appResourceUsage,
  dbNotRunning,
  dbErrorEvents,
  dbPoweredOff,
  dbResourceUsage,
  vmPoweredOff,
  aiWorkspaceFrozen,
  aiWorkspacePlan,
  bucketUsage,
  mailServerHealth,
  dnsZoneHealth,
];
