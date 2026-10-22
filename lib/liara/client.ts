import { redact } from "@/lib/redact";
import type {
  LiaraBuildLogsResponse,
  LiaraCreateAppInput,
  LiaraCreateDatabaseInput,
  LiaraNetwork,
  LiaraCreateDomainResponse,
  LiaraDeployReleaseInput,
  LiaraDeployReleaseResponse,
  LiaraDeploySourceResponse,
  LiaraDomainsResponse,
  LiaraEnvVariable,
  LiaraEventsResponse,
  LiaraLogsResponse,
  LiaraMeResponse,
  LiaraProjectAllDetailsResponse,
  LiaraReleaseDetail,
  LiaraProjectsResponse,
  LiaraReleasesResponse,
  LiaraReportsResponse,
  LiaraSummaryMetricsResponse,
  LiaraTeam,
  LiaraTeamsPageResponse,
  LiaraUpdateEnvsResponse,
} from "./types";

const BASE_URL = "https://api.liara.ir";
const TIMEOUT_MS = 15_000;
const DEFAULT_LOOKBACK_SECONDS = 60 * 60;
const TEAMS_PAGE_SIZE = 100;
const MAX_TEAM_PAGES = 50;

export type LiaraClientOptions = {
  /**
   * Team ID to operate on. Sent as the `teamID` query parameter on every request
   * (docs: references/api/about.md; CLI: lib/base.js sets `teamID` in a got hook).
   * Omit for the personal account.
   */
  teamId?: string;
};

export type LiaraErrorKind =
  | "auth"
  | "rate_limited"
  | "not_found"
  | "server"
  | "network"
  | "unknown";

export type LiaraErrorDetails = {
  /** Parsed JSON response body, or the raw text when it was not JSON. Token already scrubbed. */
  body?: unknown;
  request?: { method: string; path: string };
};

export class LiaraError extends Error {
  readonly kind: LiaraErrorKind;
  readonly status: number | null;
  readonly retryAfterSeconds?: number;
  readonly body?: unknown;
  readonly request?: { method: string; path: string };

  constructor(
    kind: LiaraErrorKind,
    message: string,
    status: number | null,
    retryAfterSeconds?: number,
    details?: LiaraErrorDetails,
  ) {
    super(message);
    this.name = "LiaraError";
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.body = details?.body;
    this.request = details?.request;
  }
}

const LIARA_RESPONSE_LIMIT = 1500;

export type NormalizedLiaraError = {
  error: string;
  status: number | null;
  liaraResponse: { message?: string; errors?: string; raw?: string } | null;
  request: { method: string; path: string } | null;
};

function clip(text: string, max = LIARA_RESPONSE_LIMIT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function firstString(body: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function summarizeBody(body: unknown, token: string): NormalizedLiaraError["liaraResponse"] {
  if (body === undefined || body === null || body === "") return null;
  const secrets = [token];
  if (typeof body === "string") return { raw: redact(clip(body.trim()), secrets) };
  if (typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const message = firstString(record, ["message", "error", "msg", "detail"]);
    const errors = record.errors ?? record.details;
    const out: { message?: string; errors?: string; raw?: string } = {};
    if (message) out.message = redact(clip(message), secrets);
    if (errors !== undefined && errors !== null) {
      const text = typeof errors === "string" ? errors : JSON.stringify(errors);
      out.errors = redact(clip(text ?? ""), secrets);
    }
    if (!out.message && !out.errors) out.raw = redact(clip(JSON.stringify(record)), secrets);
    return out;
  }
  return { raw: redact(clip(JSON.stringify(body) ?? ""), secrets) };
}

/**
 * Turns any thrown value into the structured error the agent sees: status, the
 * real Liara response (redacted, truncated) and the method + path that failed.
 */
export function normalizeLiaraError(error: unknown, token: string): NormalizedLiaraError {
  if (!(error instanceof LiaraError)) {
    return {
      error: redact("Unexpected error while calling Liara.", [token]),
      status: null,
      liaraResponse: null,
      request: null,
    };
  }
  const liaraResponse = summarizeBody(error.body, token);
  const request = error.request ?? null;
  const detail = liaraResponse?.message ?? liaraResponse?.errors ?? liaraResponse?.raw;
  const where = request ? ` for ${request.method} ${request.path}` : "";
  let text: string;
  switch (error.kind) {
    case "auth":
      text = `Liara rejected the saved token (HTTP ${error.status}). Check it in Settings.`;
      break;
    case "rate_limited":
      text = error.retryAfterSeconds
        ? `Liara rate limit reached. Retry in about ${error.retryAfterSeconds}s.`
        : "Liara rate limit reached. Try again shortly.";
      break;
    case "network":
      text = `${redact(error.message, [token])}${where}.`;
      break;
    default:
      text = `Liara answered HTTP ${error.status ?? "?"}${where}${detail ? `: ${detail}` : "."}`;
  }
  return { error: clip(text, 600), status: error.status, liaraResponse, request };
}

const LIARA_ERROR_MESSAGES: Partial<Record<LiaraErrorKind, string>> = {
  auth: "The token is invalid or has expired.",
  rate_limited: "Liara rate limit reached. Try again shortly.",
  network: "Could not reach Liara.",
};

/** User-facing message for a failed Liara call. Never includes the token. */
export function describeLiaraError(error: unknown): string {
  const kind = error instanceof LiaraError ? error.kind : "unknown";
  return LIARA_ERROR_MESSAGES[kind] ?? "Unexpected error while contacting Liara.";
}

export interface LiaraClient {
  me(): Promise<LiaraMeResponse>;
  /** Teams the account belongs to. Always sent without teamID, like the CLI does. */
  listTeams(): Promise<LiaraTeam[]>;
  listProjects(): Promise<LiaraProjectsResponse>;
  getProject(name: string): Promise<LiaraProjectAllDetailsResponse>;
  /** `since` is Unix seconds. Defaults to one hour ago. */
  getLogs(name: string, since?: number, releaseId?: string): Promise<LiaraLogsResponse>;
  /** CLI source: GET v1/releases/{id} -> { release: { state, failReason, queue } }. */
  getRelease(id: string): Promise<LiaraReleaseDetail>;
  /** CLI source: GET v2/releases/{id}/build-logs?since=<createdAt of last line>. */
  getBuildLogs(id: string, since?: string): Promise<LiaraBuildLogsResponse>;
  getEvents(name: string): Promise<LiaraEventsResponse>;
  getReleases(name: string, page?: number, count?: number): Promise<LiaraReleasesResponse>;
  getSummaryMetrics(name: string): Promise<LiaraSummaryMetricsResponse>;
  /** `since` is Unix seconds (spec: number, required). Defaults to one hour ago. */
  getCpuMetrics(name: string, since?: number): Promise<LiaraReportsResponse>;
  /** `since` is Unix seconds (spec: number, required). Defaults to one hour ago. */
  getMemoryMetrics(name: string, since?: number): Promise<LiaraReportsResponse>;
  restartProject(name: string): Promise<void>;
  setProjectScale(name: string, scale: 0 | 1): Promise<void>;
  resizeProject(name: string, planID: string): Promise<void>;
  updateEnvs(name: string, variables: LiaraEnvVariable[]): Promise<LiaraUpdateEnvsResponse>;
  /** Spec: POST /v1/projects (Create-app). */
  createProject(input: LiaraCreateAppInput): Promise<void>;
  /** CLI source: GET v1/networks. */
  listNetworks(): Promise<LiaraNetwork[]>;
  /** CLI source: POST v1/networks { networkName }. */
  createNetwork(name: string): Promise<void>;
  /** Spec: POST /v1/databases; bundlePlanID and network are required in practice (CLI source). */
  createDatabase(input: LiaraCreateDatabaseInput): Promise<{ databaseID?: string }>;
  /** Spec: POST /v2/projects/{name}/sources (multipart, gzipped source archive). */
  deploySource(name: string, archive: Blob, filename: string): Promise<LiaraDeploySourceResponse>;
  /** Spec: POST /v2/projects/{name}/releases (Deploy-releases). */
  deployRelease(
    name: string,
    input: LiaraDeployReleaseInput,
  ): Promise<LiaraDeployReleaseResponse>;
  /** Spec: GET /v1/domains?project=... */
  listDomains(project: string): Promise<LiaraDomainsResponse>;
  /** Spec: POST /v1/domains (name, project, type). */
  createDomain(input: {
    name: string;
    project: string;
    type?: string;
  }): Promise<LiaraCreateDomainResponse>;
  /** Spec: POST /v1/domains/provision-ssl-certs. */
  enableSsl(domain: string): Promise<void>;
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
  teamId?: string;
  timeoutMs?: number;
};

export function createLiaraClient(token: string, options: LiaraClientOptions = {}): LiaraClient {
  const teamId = options.teamId?.trim() || undefined;
  const call = <T>(opts: RequestOptions) => request<T>(token, { ...opts, teamId });
  const project = (name: string) => `/v1/projects/${encodeURIComponent(name)}`;

  return {
    me: () => call<LiaraMeResponse>({ method: "GET", path: "/v1/me" }),

    listTeams: async () => {
      const teams: LiaraTeam[] = [];
      for (let page = 1; page <= MAX_TEAM_PAGES; page++) {
        const body = await request<LiaraTeamsPageResponse>(token, {
          method: "GET",
          path: "/v2/teams",
          query: { page, count: TEAMS_PAGE_SIZE },
        });
        const items = body.teams ?? [];
        teams.push(...items.map((team) => ({ id: team._id, name: team.name })));
        if (items.length === 0 || typeof body.totalTeams !== "number") break;
        if (teams.length >= body.totalTeams) break;
      }
      return teams;
    },

    listProjects: () => call<LiaraProjectsResponse>({ method: "GET", path: "/v1/projects" }),

    getProject: (name) =>
      call<LiaraProjectAllDetailsResponse>({
        method: "GET",
        path: project(name),
      }),

    getLogs: async (name, since = defaultSince(), releaseId) => {
      // v1 /logs now only answers "please upgrade your client". The CLI uses v2 (commands/app/logs.js).
      const body = await call<{
        data?: Array<{ metaData?: Record<string, unknown>; values?: Array<[string, string]> }>;
      }>({
        method: "GET",
        path: `/v2/projects/${encodeURIComponent(name)}/logs`,
        query: {
          start: String(since),
          direction: "forward",
          last_lines: "false",
          ...(releaseId ? { releaseId } : {}),
        },
      });
      if (!body || typeof body !== "object" || (body.data !== undefined && !Array.isArray(body.data))) {
        throw new LiaraError("unknown", "Unexpected logs response shape from Liara API", 200);
      }
      const lines: LiaraLogsResponse = [];
      for (const entry of body.data ?? []) {
        for (const value of entry.values ?? []) {
          const [stamp, raw] = value;
          let message = raw;
          let type: string | undefined;
          try {
            const parsed = JSON.parse(raw) as { _entry?: string; type?: string };
            message = parsed._entry ?? raw;
            type = parsed.type;
          } catch {
            // plain text line
          }
          const ms = Number(String(stamp).slice(0, 13));
          lines.push({
            type,
            datetime: Number.isFinite(ms) ? new Date(ms).toISOString() : undefined,
            message,
          });
        }
      }
      lines.sort((x, y) => (x.datetime ?? "").localeCompare(y.datetime ?? ""));
      return lines;
    },

    getRelease: async (id) => {
      const body = await call<{ release?: LiaraReleaseDetail }>({
        method: "GET",
        path: `/v1/releases/${encodeURIComponent(id)}`,
      });
      return body.release ?? {};
    },

    getBuildLogs: (id, since) =>
      call<LiaraBuildLogsResponse>({
        method: "GET",
        path: `/v2/releases/${encodeURIComponent(id)}/build-logs`,
        query: since ? { since } : undefined,
      }),

    getEvents: (name) =>
      call<LiaraEventsResponse>({
        method: "GET",
        path: `${project(name)}/events`,
      }),

    getReleases: (name, page = 1, count = 10) =>
      call<LiaraReleasesResponse>({
        method: "GET",
        path: `${project(name)}/releases`,
        query: { page, count },
      }),

    getSummaryMetrics: (name) =>
      call<LiaraSummaryMetricsResponse>({
        method: "GET",
        path: `${project(name)}/metrics/summary`,
      }),

    getCpuMetrics: (name, since = defaultSince()) =>
      call<LiaraReportsResponse>({
        method: "GET",
        path: `${project(name)}/metrics/cpu`,
        query: { since },
      }),

    getMemoryMetrics: (name, since = defaultSince()) =>
      call<LiaraReportsResponse>({
        method: "GET",
        path: `${project(name)}/metrics/memory`,
        query: { since },
      }),

    restartProject: async (name) => {
      await call({ method: "POST", path: `${project(name)}/actions/restart` });
    },

    setProjectScale: async (name, scale) => {
      await call({
        method: "POST",
        path: `${project(name)}/actions/scale`,
        body: { scale },
      });
    },

    resizeProject: async (name, planID) => {
      await call({
        method: "POST",
        path: `${project(name)}/resize`,
        body: { planID },
      });
    },

    updateEnvs: (name, variables) =>
      call<LiaraUpdateEnvsResponse>({
        method: "POST",
        path: "/v1/projects/update-envs",
        body: {
          project: name,
          variables: variables.map(({ key, value }) => ({ key, value })),
        },
      }),

    createProject: async (input) => {
      await call({
        method: "POST",
        path: "/v1/projects",
        body: {
          name: input.name,
          planID: input.planID,
          ...(input.platform ? { platform: input.platform } : {}),
          ...(input.readOnlyRootFilesystem !== undefined
            ? { readOnlyRootFilesystem: input.readOnlyRootFilesystem }
            : {}),
          ...(input.bundlePlanID ? { bundlePlanID: input.bundlePlanID } : {}),
          ...(input.network ? { network: input.network } : {}),
        },
      });
    },

    listNetworks: async () => {
      const body = await call<{ networks?: LiaraNetwork[] }>({ method: "GET", path: "/v1/networks" });
      return body.networks ?? [];
    },

    createNetwork: async (name) => {
      await call({ method: "POST", path: "/v1/networks", body: { networkName: name } });
    },

    createDatabase: (input) =>
      call<{ databaseID?: string }>({ method: "POST", path: "/v1/databases", body: input }),

    deploySource: (name, archive, filename) => {
      const form = new FormData();
      form.append("file", archive, filename);
      return call<LiaraDeploySourceResponse>({
        method: "POST",
        path: `/v2/projects/${encodeURIComponent(name)}/sources`,
        body: form,
        timeoutMs: 180_000,
      });
    },

    deployRelease: (name, input) =>
      call<LiaraDeployReleaseResponse>({
        method: "POST",
        path: `/v2/projects/${encodeURIComponent(name)}/releases`,
        body: input,
      }),

    listDomains: (project) =>
      call<LiaraDomainsResponse>({
        method: "GET",
        path: "/v1/domains",
        query: { project },
      }),

    createDomain: (input) =>
      call<LiaraCreateDomainResponse>({
        method: "POST",
        path: "/v1/domains",
        body: { name: input.name, project: input.project, type: input.type ?? "PROJECT" },
      }),

    enableSsl: async (domain) => {
      await call({
        method: "POST",
        path: "/v1/domains/provision-ssl-certs",
        body: { domain },
      });
    },
  };
}

function defaultSince(): number {
  return Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_SECONDS;
}

async function request<T>(
  token: string,
  { method, path, query, body, teamId, timeoutMs }: RequestOptions,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  if (teamId) {
    url.searchParams.set("teamID", teamId);
  }

  const requestInfo = { method, path: url.pathname };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      if (controller.signal.aborted) {
        throw new LiaraError(
          "network",
          `Liara API request timed out after ${(timeoutMs ?? TIMEOUT_MS) / 1000}s`,
          null,
          undefined,
          { request: requestInfo },
        );
      }
      throw new LiaraError("network", "Could not reach the Liara API", null, undefined, {
        request: requestInfo,
      });
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const text = token.length >= 4 ? raw.split(token).join("[REDACTED]") : raw;
      let parsed: unknown = text.trim() ? text : undefined;
      try {
        if (text.trim()) parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      throw errorForStatus(res.status, res.headers.get("retry-after"), {
        body: parsed,
        request: requestInfo,
      });
    }

    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new LiaraError("unknown", "Liara API returned a non-JSON response", res.status, undefined, {
        request: requestInfo,
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

function errorForStatus(
  status: number,
  retryAfter: string | null,
  details: LiaraErrorDetails,
): LiaraError {
  if (status === 401 || status === 403) {
    return new LiaraError(
      "auth",
      `Liara API rejected the token (HTTP ${status})`,
      status,
      undefined,
      details,
    );
  }
  if (status === 404) {
    return new LiaraError("not_found", "Liara resource not found (HTTP 404)", status, undefined, details);
  }
  if (status === 429) {
    return new LiaraError(
      "rate_limited",
      "Liara API rate limit reached (HTTP 429)",
      status,
      parseRetryAfter(retryAfter),
      details,
    );
  }
  if (status >= 500) {
    return new LiaraError(
      "server",
      `Liara API server error (HTTP ${status})`,
      status,
      undefined,
      details,
    );
  }
  return new LiaraError(
    "unknown",
    `Unexpected Liara API response (HTTP ${status})`,
    status,
    undefined,
    details,
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** Calls a documented Liara endpoint by absolute URL. Used by the generic API tools. */
export function liaraRawRequest<T = unknown>(
  token: string,
  options: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    query?: Record<string, string | number>;
    body?: unknown;
    teamId?: string;
  },
): Promise<T> {
  const { url, ...rest } = options;
  return request<T>(token, { ...rest, path: url, timeoutMs: 30_000 });
}
