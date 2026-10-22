import type { LiaraClient } from "@/lib/liara/client";
import { encryptedEnvValues } from "@/lib/redact";
import type { LiaraContext } from "@/lib/settings";
import { describeError, isFatal } from "./errors";
import {
  fetchBucketMetrics,
  fetchDatabase,
  fetchDatabaseSummary,
  fetchVm,
  fetchWorkspace,
} from "./fetch";
import type { DataSource, ResourceSnapshot } from "./rules";
import type { CheckTarget } from "./targets";

export interface LoadedTarget {
  snapshot: ResourceSnapshot;
  /** Sources that loaded. Rules run only when every source they require is here. */
  available: Set<DataSource>;
  /** Per-source failures. A target with failures is never used to resolve findings. */
  failures: string[];
  /** Encrypted app env values, scrubbed from finding text. */
  secrets: string[];
}

/** Null for kinds that have no documented health or metrics endpoint. */
export async function loadTarget(
  client: LiaraClient,
  ctx: LiaraContext,
  target: CheckTarget,
): Promise<LoadedTarget | null> {
  switch (target.kind) {
    case "app":
      return loadApp(client, target);
    case "database":
      return loadDatabase(ctx, target);
    case "vm":
      return loadVm(ctx, target);
    case "ai_workspace":
      return loadAiWorkspace(ctx, target);
    case "bucket":
      return loadBucket(ctx, target);
    case "mail_server":
    case "dns_zone":
      return null;
  }
}

function collector() {
  const available = new Set<DataSource>();
  const failures: string[] = [];
  const accept = <T>(
    result: PromiseSettledResult<T>,
    source: DataSource,
    label: string,
    assign: (value: T) => void,
  ): void => {
    if (result.status === "fulfilled") {
      assign(result.value);
      available.add(source);
      return;
    }
    if (isFatal(result.reason)) throw result.reason;
    failures.push(`${label} unavailable: ${describeError(result.reason)}`);
  };
  return { available, failures, accept };
}

async function loadApp(client: LiaraClient, target: CheckTarget): Promise<LoadedTarget> {
  const snapshot: Extract<ResourceSnapshot, { kind: "app" }> = { kind: "app", name: target.name };
  const { available, failures, accept } = collector();
  const [details, logs, summary, releases] = await Promise.allSettled([
    client.getProject(target.resourceId),
    client.getLogs(target.resourceId),
    client.getSummaryMetrics(target.resourceId),
    client.getReleases(target.resourceId),
  ]);
  accept(details, "details", "Project details", (value) => {
    snapshot.details = value.project;
  });
  accept(logs, "logs", "Logs", (value) => {
    snapshot.logs = value;
  });
  accept(summary, "summary", "Metrics", (value) => {
    snapshot.summary = value;
  });
  accept(releases, "releases", "Releases", (value) => {
    snapshot.releases = value;
  });
  return { snapshot, available, failures, secrets: encryptedEnvValues(snapshot.details) };
}

async function loadDatabase(ctx: LiaraContext, target: CheckTarget): Promise<LoadedTarget> {
  const snapshot: Extract<ResourceSnapshot, { kind: "database" }> = {
    kind: "database",
    name: target.name,
  };
  const { available, failures, accept } = collector();
  const [details, summary] = await Promise.allSettled([
    fetchDatabase(ctx, target.resourceId),
    fetchDatabaseSummary(ctx, target.resourceId),
  ]);
  accept(details, "details", "Database details", (value) => {
    snapshot.details = value;
  });
  accept(summary, "summary", "Metrics", (value) => {
    snapshot.summary = value;
  });
  return { snapshot, available, failures, secrets: [] };
}

async function loadVm(ctx: LiaraContext, target: CheckTarget): Promise<LoadedTarget> {
  const snapshot: Extract<ResourceSnapshot, { kind: "vm" }> = { kind: "vm", name: target.name };
  const { available, failures, accept } = collector();
  const [details] = await Promise.allSettled([fetchVm(ctx, target.resourceId)]);
  accept(details, "details", "VM details", (value) => {
    snapshot.details = value;
  });
  return { snapshot, available, failures, secrets: [] };
}

async function loadAiWorkspace(ctx: LiaraContext, target: CheckTarget): Promise<LoadedTarget> {
  const snapshot: Extract<ResourceSnapshot, { kind: "ai_workspace" }> = {
    kind: "ai_workspace",
    name: target.name,
  };
  const { available, failures, accept } = collector();
  const [details] = await Promise.allSettled([fetchWorkspace(ctx, target.resourceId)]);
  accept(details, "details", "Workspace details", (value) => {
    snapshot.details = value;
  });
  return { snapshot, available, failures, secrets: [] };
}

async function loadBucket(ctx: LiaraContext, target: CheckTarget): Promise<LoadedTarget> {
  const snapshot: Extract<ResourceSnapshot, { kind: "bucket" }> = {
    kind: "bucket",
    name: target.name,
  };
  const { available, failures, accept } = collector();
  const [metrics] = await Promise.allSettled([fetchBucketMetrics(ctx, target.resourceId)]);
  accept(metrics, "summary", "Metrics", (value) => {
    snapshot.metrics = value;
  });
  return { snapshot, available, failures, secrets: [] };
}
