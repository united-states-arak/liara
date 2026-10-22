import { LiaraError, type LiaraErrorKind } from "@/lib/liara/client";
import type { LiaraSummaryMetricsResponse } from "@/lib/liara/types";
import type { LiaraContext } from "@/lib/settings";

// Calls for kinds the app client does not cover. Each path is documented in
// data/liara-api/dbaas.yaml, object-storage.yaml, https://developers.liara.ir/spec/Iaas.yaml,
// or https://developers.liara.ir/spec/ai-workspaces.yaml. Only fields that rules read are kept.
const SERVERS = {
  dbaas: "https://api.liara.ir",
  iaas: "https://iaas-api.liara.ir",
  ai: "https://ai.liara.ir",
  storage: "https://storage-service.liara.ir",
} as const;
const TIMEOUT_MS = 15_000;

export interface DatabaseDetails {
  type?: string;
  version?: string;
  status?: string;
  scale?: number;
}

export interface VmDetails {
  name?: string;
  plan?: string;
  power?: string;
  state?: string;
  guestState?: string;
}

export interface WorkspaceDetails {
  name?: string;
  plan?: string;
  state?: string;
  providerPreferences?: string;
  updatedAt?: string;
}

/** Raw values as documented. The spec spells the object count field "totol_objects". */
export interface BucketMetrics {
  totalObjects?: Array<number | string>;
  totalBytes?: Array<number | string>;
}

type Json = Record<string, unknown>;

export async function fetchDatabase(ctx: LiaraContext, id: string): Promise<DatabaseDetails> {
  const body = await liaraGet(SERVERS.dbaas, `/v1/databases/${encodeURIComponent(id)}`, ctx);
  const database = objectField(body, "database", "database");
  return {
    type: str(database.type),
    version: str(database.version),
    status: str(database.status),
    scale: num(database.scale),
  };
}

export async function fetchDatabaseSummary(
  ctx: LiaraContext,
  id: string,
): Promise<LiaraSummaryMetricsResponse> {
  const body = await liaraGet(
    SERVERS.dbaas,
    `/v1/databases/${encodeURIComponent(id)}/metrics/summary`,
    ctx,
  );
  if (!isRecord(body)) throw shapeError("database metrics");
  return body as LiaraSummaryMetricsResponse;
}

export async function fetchVm(ctx: LiaraContext, id: string): Promise<VmDetails> {
  const body = await liaraGet(SERVERS.iaas, `/vm/${encodeURIComponent(id)}`, ctx);
  if (!isRecord(body)) throw shapeError("VM");
  return {
    name: str(body.name),
    plan: str(body.plan),
    power: str(body.power),
    state: str(body.state),
    guestState: str(body.guestState),
  };
}

export async function fetchWorkspace(ctx: LiaraContext, id: string): Promise<WorkspaceDetails> {
  const body = await liaraGet(SERVERS.ai, `/v1/workspaces/${encodeURIComponent(id)}`, ctx);
  const workspace = objectField(body, "workspace", "workspace");
  return {
    name: str(workspace.name),
    plan: str(workspace.plan),
    state: str(workspace.state),
    providerPreferences: str(workspace.providerPreferences),
    updatedAt: str(workspace.updatedAt),
  };
}

export async function fetchBucketMetrics(ctx: LiaraContext, id: string): Promise<BucketMetrics> {
  const body = await liaraGet(
    SERVERS.storage,
    `/api/v1/buckets/${encodeURIComponent(id)}/metrics/summary`,
    ctx,
  );
  if (!isRecord(body)) throw shapeError("bucket metrics");
  const data = isRecord(body.data) ? body.data : {};
  const metrics = isRecord(data.metrics) ? data.metrics : {};
  return {
    totalObjects: scalarList(metrics.totol_objects),
    totalBytes: scalarList(metrics.total_bytes),
  };
}

async function liaraGet(base: string, path: string, ctx: LiaraContext): Promise<unknown> {
  const url = new URL(path, base);
  if (ctx.teamId) {
    url.searchParams.set("teamID", ctx.teamId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      throw controller.signal.aborted
        ? new LiaraError("network", "Liara API request timed out", null)
        : new LiaraError("network", "Could not reach the Liara API", null);
    }
    if (!res.ok) {
      await res.text().catch(() => "");
      throw errorForStatus(res.status, res.headers.get("retry-after"));
    }
    const raw = await res.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new LiaraError("unknown", "Liara API returned a non-JSON response", res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

function errorForStatus(status: number, retryAfter: string | null): LiaraError {
  const kind: LiaraErrorKind =
    status === 401 || status === 403
      ? "auth"
      : status === 404
        ? "not_found"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "server"
            : "unknown";
  const seconds = Number(retryAfter);
  const retryAfterSeconds =
    status === 429 && Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
  return new LiaraError(kind, `Liara API responded with HTTP ${status}`, status, retryAfterSeconds);
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shapeError(label: string): LiaraError {
  return new LiaraError("unknown", `Unexpected ${label} response shape from Liara API`, 200);
}

function objectField(body: unknown, key: string, label: string): Json {
  const value = isRecord(body) ? body[key] : undefined;
  if (!isRecord(value)) throw shapeError(label);
  return value;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function scalarList(value: unknown): Array<number | string> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (item): item is number | string => typeof item === "number" || typeof item === "string",
  );
}
