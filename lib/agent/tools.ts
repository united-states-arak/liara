import { tool, type Tool, type ToolExecutionOptions, type ToolSet } from "ai";
import { z } from "zod";
import { liaraContext } from "@/lib/settings";
import {
  createLiaraClient,
  liaraRawRequest,
  LiaraError,
  normalizeLiaraError,
  type LiaraClient,
} from "@/lib/liara/client";
import { matchOperation, searchOperations, servicesList } from "@/lib/liara/api-index";
import type { LiaraReleasesResponse } from "@/lib/liara/types";
import { redact } from "@/lib/redact";
import { getLiaraDocByUrl, refreshLiaraDocPage, searchLiaraDocs } from "@/lib/docs/search";
import { getFinding, listFindings } from "@/lib/checker/queries";
import { runChecks } from "@/lib/checker/run";
import { buildFixPrompt } from "@/lib/fix-prompt";
import { PLATFORMS } from "@/lib/liara/platforms";
import { ensureNetwork, pickAppPlan, pickDatabase } from "@/lib/liara/provision";
import { inspectRepo, readRepoFile } from "./repo-inspect";
import { fetchSourceArchive, repackArchive, SourceError } from "./source-fetch";
import { MODE_TOOL_NAMES, WRITE_TOOL_NAMES, type AgentMode } from "./config";
import { appIsAttached, notAttachedMessage, type ResourceRef } from "./scope";
import {
  ARCHITECTURE_KINDS,
  type AccountPlansResult,
  type DeployPromptResult,
  type DeployResult,
  type ListDomainsResult,
  type ArchitectureResult,
  type EventsResult,
  type FindingResult,
  type FixPromptResult,
  type GetFindingResult,
  type GetLogsResult,
  type GetMetricsResult,
  type GetProjectResult,
  type HealthCheckResult,
  type ListFindingsResult,
  type ListProjectsResult,
  type ListReleasesResult,
  type MetricSeriesResult,
  type ReadDocResult,
  type SearchDocsResult,
  type ToolErrorResult,
  type WaitForLiaraResult,
  type WaitForReleaseResult,
  type WriteResult,
} from "./tool-results";

const TOKEN_MISSING = "Liara token not configured. Open Settings to add it.";
const LOG_LINE_LIMIT = 200;
const BUILD_LOG_LIMIT = 150;
const DOC_CHARS_LIMIT = 6000;
const LOOKBACK_SECONDS = 60 * 60;
const MAX_SINCE_AGE_SECONDS = 7 * 24 * 60 * 60;
const DOCS_ORIGIN = "https://docs.liara.ir/";
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;


const appName = z
  .string()
  .min(1)
  .max(100)
  .describe("Liara app name, as returned by list_projects.");

function failureResult(error: unknown, token: string): ToolErrorResult {
  return normalizeLiaraError(error, token);
}

function scrubLiteral<T>(value: T, secrets: readonly string[]): T {
  const literal = secrets.filter((secret) => secret.length >= 4);
  if (literal.length === 0) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return literal.reduce((text, secret) => text.split(secret).join("[REDACTED]"), node);
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return walk(value) as T;
}

async function withLiara<T>(
  call: (client: LiaraClient, token: string) => Promise<T>,
): Promise<T | ToolErrorResult> {
  const ctx = await liaraContext();
  if (!ctx) return { error: TOKEN_MISSING };
  const { token } = ctx;
  try {
    const client = createLiaraClient(token, { teamId: ctx.teamId ?? undefined });
    return scrubLiteral(await call(client, token), [token]);
  } catch (error) {
    return failureResult(error, token);
  }
}

const WAIT_INTERVAL_MS = 3000;
const WAIT_MAX_MS = 45_000;

function readField(data: unknown, field: string): unknown {
  return field
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      data,
    );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function newestReleaseId(client: LiaraClient, name: string): Promise<string | undefined> {
  const response = await client.getReleases(name, 1, 1);
  return response.releases[0]?._id ?? response.currentRelease;
}

function limitJson(value: unknown, max = 8000): unknown {
  const text = JSON.stringify(value) ?? "";
  if (text.length <= max) return value;
  return { truncated: true, preview: text.slice(0, max) };
}

function errorResult(error: unknown): ToolErrorResult {
  return {
    error: redact(error instanceof Error ? error.message : "Unexpected error."),
  };
}

function sinceSeconds(since: number | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  if (since === undefined) return now - LOOKBACK_SECONDS;
  const seconds = since > 1e11 ? Math.floor(since / 1000) : since;
  return Math.max(seconds, now - MAX_SINCE_AGE_SECONDS);
}

function toFinding(row: Awaited<ReturnType<typeof getFinding>>): FindingResult | null {
  if (!row) return null;
  return {
    id: row.id,
    severity: row.severity,
    title: redact(row.title),
    summary: redact(row.summary),
    projectName: row.projectName,
    serviceName: row.serviceName,
    status: row.status,
    ruleId: row.ruleId,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function metricSeries(
  rows: ReadonlyArray<{ values?: unknown[]; applet?: string }> | undefined,
): MetricSeriesResult {
  return (rows ?? []).map((row) => ({
    points: row.values?.length ?? 0,
    latest: row.values?.at(-1) ?? null,
    ...(row.applet !== undefined ? { applet: row.applet } : {}),
  }));
}

function settledPart<T, R>(
  result: PromiseSettledResult<T>,
  token: string,
  map: (value: T) => R,
): R | ToolErrorResult {
  if (result.status === "rejected") {
    return failureResult(result.reason, token);
  }
  return map(result.value);
}

const ALL_TOOLS = {
  list_projects: tool({
    description:
      "List the Liara apps on the connected account: name, type, status, scale (1 on, 0 stopped), plan and whether they are deployed.",
    inputSchema: z.object({}),
    execute: async (): Promise<ListProjectsResult> =>
      withLiara(async (client) => {
        const response = await client.listProjects();
        return {
          projects: response.projects.map((project) => ({
            name: project.project_id,
            type: project.type,
            status: project.status,
            scale: project.scale,
            planID: project.planID,
            isDeployed: project.isDeployed,
            createdAt: project.created_at,
          })),
        };
      }),
  }),

  get_project: tool({
    description:
      "Get one app's status, scale, plan, node, deployed flag and environment variable KEYS. Values are never returned.",
    inputSchema: z.object({ name: appName }),
    execute: async ({ name }): Promise<GetProjectResult> =>
      withLiara(async (client) => {
        const { project } = await client.getProject(name);
        return {
          name: project.project_id ?? name,
          type: project.type,
          status: project.status,
          scale: project.scale,
          planID: project.planID,
          isDeployed: project.isDeployed,
          createdAt: project.created_at,
          node: project.node ? { id: project.node._id, ip: project.node.IP } : null,
          envKeys: (project.envs ?? []).map((env) => ({
            key: env.key,
            encrypted: env.encrypted === true,
          })),
          envValues: "hidden" as const,
        };
      }),
  }),

  get_logs: tool({
    description: `Fetch the app's RUNTIME logs (what the running app prints; NOT build output: use get_build_logs for that) since a Unix time in seconds (default: one hour ago). Returns at most ${LOG_LINE_LIMIT} of the newest lines, redacted.`,
    inputSchema: z.object({
      name: appName,
      since: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Unix time in seconds. Default: one hour ago."),
      releaseID: z.string().min(1).max(100).optional().describe("Only this release's runtime logs."),
    }),
    execute: async ({ name, since, releaseID }): Promise<GetLogsResult> =>
      withLiara(async (client, token) => {
        const from = sinceSeconds(since);
        const [project, logs] = await Promise.all([
          client.getProject(name).catch(() => null),
          client.getLogs(name, from, releaseID),
        ]);
        const secrets = [token, ...(project?.project.envs ?? []).map((env) => env.value)];
        const lines = logs.map((line) => ({
          time: line.datetime,
          type: line.type,
          message: redact(line.message ?? "", secrets),
        }));
        return {
          name,
          since: new Date(from * 1000).toISOString(),
          count: lines.length,
          truncated: lines.length > LOG_LINE_LIMIT,
          lines: lines.slice(-LOG_LINE_LIMIT),
        };
      }),
  }),

  get_metrics: tool({
    description:
      "Get the app's summary CPU and memory usage, plus the last hour of CPU and memory series. Only the values Liara returns are shown.",
    inputSchema: z.object({ name: appName }),
    execute: async ({ name }): Promise<GetMetricsResult> =>
      withLiara(async (client, token) => {
        const from = sinceSeconds(undefined);
        const [summary, cpu, memory] = await Promise.allSettled([
          client.getSummaryMetrics(name),
          client.getCpuMetrics(name, from),
          client.getMemoryMetrics(name, from),
        ]);
        return {
          name,
          summary: settledPart(summary, token, (value) => ({
            cpuUsage: (value.cpuUsage ?? []).map((row) => ({
              points: 1,
              latest: row.value,
              ...(row.applet !== undefined ? { applet: row.applet } : {}),
            })),
            memoryUsage: (value.memoryUsage ?? []).map((row) => ({
              points: 1,
              latest: row.value,
              ...(row.applet !== undefined ? { applet: row.applet } : {}),
            })),
          })),
          cpu: settledPart(cpu, token, (value) => ({
            series: metricSeries(value.result),
          })),
          memory: settledPart(memory, token, (value) => ({
            series: metricSeries(value.result),
          })),
        };
      }),
  }),

  list_releases: tool({
    description:
      "List the app's recent releases (deployments) with state, tag, time and git commit, newest first.",
    inputSchema: z.object({
      name: appName,
      count: z.number().int().min(1).max(50).optional(),
    }),
    execute: async ({ name, count }): Promise<ListReleasesResult> =>
      withLiara(async (client) => {
        const response: LiaraReleasesResponse = await client.getReleases(name, 1, count ?? 10);
        return {
          name,
          currentRelease: response.currentRelease,
          total: response.total,
          releases: response.releases.map((release) => ({
            id: release._id,
            state: release.state,
            tag: release.tag,
            createdAt: release.createdAt,
            finishedAt: release.finishedAt,
            branch: release.gitInfo?.branch ?? null,
            commit: release.gitInfo?.commit ?? null,
            commitMessage: release.gitInfo?.message ?? null,
          })),
        };
      }),
  }),

  get_events: tool({
    description:
      "Get the app's recent platform events (for example restarts, deploys, scale changes).",
    inputSchema: z.object({ name: appName }),
    execute: async ({ name }): Promise<EventsResult> =>
      withLiara(async (client) => {
        const response = await client.getEvents(name);
        return {
          name,
          events: response.data.slice(0, 50).map((entry) => ({
            metaData: entry.metaData,
            values: (entry.values ?? []).slice(0, 20),
          })),
        };
      }),
  }),

  get_account_plans: tool({
    description:
      "Get the plans available on the account, exactly as Liara returns them (names, ids and any prices in the response).",
    inputSchema: z.object({}),
    execute: async (): Promise<AccountPlansResult> =>
      withLiara(async (client) => {
        const me = await client.me();
        return {
          plans: me.plans ?? null,
          databaseVersions: (me as { databaseVersions?: unknown }).databaseVersions ?? null,
        } as AccountPlansResult;
      }),
  }),

  search_liara_docs: tool({
    description:
      "Search the Liara documentation. Returns titles, URLs and excerpts. Cite the URL when you rely on a result. Docs may show `liara` CLI commands: do not relay CLI-only instructions for an operation a Liara tool covers (use the tool instead). The CLI is only for uploading local source code or files to deploy.",
    inputSchema: z.object({
      query: z.string().min(2).max(200),
      limit: z.number().int().min(1).max(8).optional(),
    }),
    execute: async ({ query, limit }): Promise<SearchDocsResult> => {
      try {
        const results = await searchLiaraDocs({ query, limit: limit ?? 5 });
        return {
          results: results.map((hit) => ({
            title: hit.title,
            url: hit.url,
            section: hit.section,
            excerpt: hit.excerpt,
          })),
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  read_liara_doc: tool({
    description: `Read one Liara documentation page (docs.liara.ir only). Returns up to ${DOC_CHARS_LIMIT} characters of markdown. Pages may show \`liara\` CLI commands: do not relay CLI-only instructions for an operation a Liara tool covers (use the tool instead). The CLI is only for uploading local source code or files to deploy.`,
    inputSchema: z.object({ url: z.string().url().max(300) }),
    execute: async ({ url }): Promise<ReadDocResult> => {
      if (!url.startsWith(DOCS_ORIGIN)) {
        return { error: "Only docs.liara.ir pages can be read." };
      }
      try {
        const cached = await getLiaraDocByUrl(url);
        const page = cached ?? {
          title: url,
          url,
          markdown: (await refreshLiaraDocPage(url)).markdown,
        };
        return {
          title: page.title,
          url: page.url,
          markdown: page.markdown.slice(0, DOC_CHARS_LIMIT),
          truncated: page.markdown.length > DOC_CHARS_LIMIT,
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  list_findings: tool({
    description:
      "List findings from the background checker (problems it detected on apps), most severe first.",
    inputSchema: z.object({ includeResolved: z.boolean().optional() }),
    execute: async ({ includeResolved }): Promise<ListFindingsResult> => {
      try {
        const rows = await listFindings({ includeResolved: includeResolved ?? false });
        return {
          findings: rows
            .slice(0, 50)
            .map((row) => toFinding(row))
            .filter((row): row is FindingResult => row !== null),
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  get_finding: tool({
    description: "Get one finding with its redacted evidence.",
    inputSchema: z.object({ id: z.string().min(1).max(100) }),
    execute: async ({ id }): Promise<GetFindingResult> => {
      try {
        const row = await getFinding(id);
        const finding = toFinding(row);
        if (!row || !finding) return { error: "Finding not found." };
        return {
          finding: {
            ...finding,
            evidence: row.evidence.map((item) => ({
              label: redact(item.label),
              value: redact(item.value),
            })),
          },
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  run_health_check: tool({
    description:
      "Run the health checks now (same checks as the background job) and return the run summary.",
    inputSchema: z.object({}),
    execute: async (): Promise<HealthCheckResult> => {
      try {
        const result = await runChecks("manual");
        return {
          runId: result.runId,
          status: result.status,
          projectsChecked: result.projectsChecked,
          ...(result.error ? { error: redact(result.error) } : {}),
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  generate_fix_prompt: tool({
    description:
      "Build a ready-to-paste fix prompt for a coding agent from a finding, with the relevant Liara doc sources.",
    inputSchema: z.object({
      findingId: z.string().min(1).max(100),
      target: z.enum(["claude-code", "cursor", "codex", "generic"]).optional(),
      extraContext: z.string().max(1000).optional(),
    }),
    execute: async ({ findingId, target, extraContext }): Promise<FixPromptResult> => {
      try {
        const row = await getFinding(findingId);
        if (!row) return { error: "Finding not found." };
        const docs = await searchLiaraDocs({
          query: `${row.title} ${row.ruleId.replace(/[-_]/g, " ")}`,
          limit: 4,
        }).catch(() => []);
        const built = buildFixPrompt({
          finding: {
            id: row.id,
            ruleId: row.ruleId,
            projectName: row.projectName,
            serviceName: row.serviceName,
            severity: row.severity,
            title: row.title,
            summary: row.summary,
            evidence: row.evidence,
            firstSeenAt: row.firstSeenAt,
            lastSeenAt: row.lastSeenAt,
            status: row.status,
          },
          docs: docs.map((doc) => ({ title: doc.title, url: doc.url, excerpt: doc.excerpt })),
          target: target ?? "generic",
          extraContext,
        });
        return {
          prompt: built.prompt,
          warnings: built.warnings,
          target: target ?? "generic",
          sources: docs.map((doc) => ({ title: doc.title, url: doc.url })),
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  }),

  restart_project: tool({
    description: "Restart an app. Runs only after the user approves it in the UI.",
    inputSchema: z.object({ name: appName }),
    execute: async ({ name }): Promise<WriteResult> =>
      withLiara(async (client) => {
        await client.restartProject(name);
        return { ok: true as const, summary: `Restart requested for ${name}.` };
      }),
  }),

  set_project_scale: tool({
    description:
      "Set an app's scale: 0 STOPS the app, 1 STARTS it. Runs only after the user approves it in the UI.",
    inputSchema: z.object({
      name: appName,
      scale: z.union([z.literal(0), z.literal(1)]).describe("0 = stop the app, 1 = start the app."),
    }),
    execute: async ({ name, scale }): Promise<WriteResult> =>
      withLiara(async (client) => {
        await client.setProjectScale(name, scale);
        return {
          ok: true as const,
          summary: scale === 0 ? `Stopped ${name} (scale 0).` : `Started ${name} (scale 1).`,
        };
      }),
  }),

  resize_project: tool({
    description:
      "Change an app's plan. Use a planID from get_account_plans. Runs only after the user approves it in the UI.",
    inputSchema: z.object({
      name: appName,
      planID: z.string().min(1).max(100),
    }),
    execute: async ({ name, planID }): Promise<WriteResult> =>
      withLiara(async (client) => {
        await client.resizeProject(name, planID);
        return { ok: true as const, summary: `Plan of ${name} changed to ${planID}.` };
      }),
  }),

  update_env_vars: tool({
    description:
      "Add or overwrite environment variables on an app. Existing variables are kept: the tool merges by key before saving. Runs only after the user approves it in the UI; values are never shown back.",
    inputSchema: z.object({
      name: appName,
      variables: z
        .array(
          z.object({
            key: z.string().regex(ENV_KEY),
            value: z.string().max(8192),
          }),
        )
        .min(1)
        .max(50)
        .refine(
          (items) => new Set(items.map((item) => item.key)).size === items.length,
          "Keys must be unique.",
        ),
    }),
    execute: async ({ name, variables }): Promise<WriteResult> =>
      withLiara(async (client) => {
        const { project } = await client.getProject(name);
        const incoming = new Set(variables.map((variable) => variable.key));
        const kept: Array<{ key: string; value: string }> = [];
        for (const env of project.envs ?? []) {
          if (incoming.has(env.key)) continue;
          if (typeof env.value !== "string") {
            return {
              error: `Cannot merge safely: the current value of ${env.key} is not available. Change the variables in the Liara console instead.`,
            };
          }
          kept.push({ key: env.key, value: env.value });
        }
        await client.updateEnvs(name, [
          ...kept,
          ...variables.map((variable) => ({ key: variable.key, value: variable.value })),
        ]);
        return {
          ok: true as const,
          summary: `Set ${variables.length} variable(s) on ${name}: ${[...incoming].join(", ")}. ${kept.length} other variable(s) kept.`,
        };
      }),
  }),

  list_domains: tool({
    description: "List the domains connected to an app, with status and SSL (certificate) status.",
    inputSchema: z.object({ name: appName }),
    execute: async ({ name }): Promise<ListDomainsResult> =>
      withLiara(async (client) => {
        const response = await client.listDomains(name);
        return {
          name,
          domains: (response.domains ?? []).map((domain) => ({
            id: domain._id,
            name: domain.name,
            status: domain.status,
            certificatesStatus: domain.certificatesStatus,
            cnameRecord: domain.CNameRecord,
          })),
        };
      }),
  }),

  create_project: tool({
    description:
      "Create a new, empty Liara app. The tool itself finds a suitable plan (cheapest available), the feature bundle plan and the network (creating one if needed), so only name and platform are required. Pass planID only to override. Runs only after approval. Afterwards call deploy_project or deploy_image.",
    inputSchema: z.object({
      name: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Lowercase letters, digits and dashes.")
        .describe("New app name (lowercase letters, digits, dashes). Choose it yourself."),
      platform: z.enum(PLATFORMS),
      planID: z.string().min(1).max(100).optional(),
    }),
    execute: async ({ name, planID, platform }): Promise<WriteResult> =>
      withLiara(async (client) => {
        const me = await client.me();
        const plan = pickAppPlan(me as never, planID);
        const network = await ensureNetwork(client);
        await client.createProject({
          name,
          platform,
          planID: plan.planID,
          bundlePlanID: plan.bundlePlanID,
          network: network._id,
        });
        return {
          ok: true as const,
          summary: `Created app ${name} (${platform}, plan ${plan.planID}${plan.bundlePlanID ? `, bundle ${plan.bundlePlanID}` : ""}, network ${network.name}).`,
        };
      }),
  }),

  create_database: tool({
    description:
      "Create a Liara database (postgres, mysql, mariadb, mongodb, redis, mssql, elasticsearch, rabbitmq, clickhouse). The tool itself finds the newest stable version (from GET /v1/me databaseVersions), the cheapest available plan that supports the type, the feature bundle plan and the network, so only hostname and type are required. Runs only after approval. Afterwards use wait_for_liara on /v1/databases/<databaseID> and liara_api_get to read the connection details.",
    inputSchema: z.object({
      hostname: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/)
        .describe("Database name. Choose it yourself, e.g. umami-db."),
      type: z.string().min(2).max(30),
      version: z.string().max(30).optional(),
      planID: z.string().max(100).optional(),
      publicNetwork: z.boolean().optional().describe("Default false (private)."),
    }),
    execute: async ({ hostname, type, version, planID, publicNetwork }): Promise<WriteResult> =>
      withLiara(async (client) => {
        const me = await client.me();
        const pick = pickDatabase(me as never, { type, version, planID });
        const network = await ensureNetwork(client);
        const created = await client.createDatabase({
          hostname,
          type: pick.type,
          version: pick.version,
          planID: pick.planID,
          bundlePlanID: pick.bundlePlanID,
          publicNetwork: publicNetwork ?? false,
          network: network._id,
        });
        return {
          ok: true as const,
          summary: `Created ${pick.type} ${pick.version} database ${hostname} (plan ${pick.planID}${pick.bundlePlanID ? `, bundle ${pick.bundlePlanID}` : ""}, network ${network.name}). databaseID: ${created.databaseID ?? "unknown"}.`,
        };
      }),
  }),

  deploy_project: tool({
    description:
      "Deploy code to an existing app through the Liara API: downloads a public source archive on the server, uploads it (POST /v2/projects/{name}/sources) and starts a release (POST /v2/projects/{name}/releases). sourceUrl is a public GitHub repo link or an https .tar.gz URL. Runs only after approval. Afterwards call list_releases and get_logs to verify.",
    inputSchema: z.object({
      name: appName,
      sourceUrl: z.string().url().max(500),
      branch: z.string().min(1).max(100).optional(),
      platform: z.enum(PLATFORMS),
      port: z.number().int().min(1).max(65535).describe("Port the app listens on."),
      files: z
        .array(z.object({ path: z.string().min(1).max(200), content: z.string().max(20000) }))
        .max(10)
        .optional()
        .describe(
          "Files to add to the source before upload, usually a Dockerfile (+ .dockerignore) for frameworks Liara has no platform for, such as Astro. Use with platform docker.",
        ),
    }),
    execute: async ({ name, sourceUrl, branch, platform, port, files }): Promise<DeployResult> =>
      withLiara(async (client) => {
        let archive;
        try {
          archive = await fetchSourceArchive(sourceUrl, branch);
          archive = { ...archive, blob: await repackArchive(archive.blob, files ?? []) };
        } catch (error) {
          return {
            error: error instanceof SourceError ? error.message : "Could not fetch the source.",
          };
        }
        const source = await client.deploySource(name, archive.blob, "source.tar.gz");
        if (!source.sourceID) return { error: "Liara did not return a sourceID for the upload." };
        const release = await client.deployRelease(name, {
          sourceID: source.sourceID,
          port,
          type: platform,
        });
        return {
          ok: true as const,
          summary: `Deployment of ${name} started from ${archive.url}.`,
          name,
          releaseID: release.releaseID,
          sourceID: source.sourceID,
          port,
          platform,
        };
      }),
  }),

  add_domain: tool({
    description:
      "Add a domain to an app (POST /v1/domains). Runs only after approval. Afterwards call list_domains and tell the user which DNS record to create (cnameRecord).",
    inputSchema: z.object({
      name: appName,
      domain: z.string().min(3).max(253).describe("Domain without www, e.g. example.ir."),
    }),
    execute: async ({ name, domain }): Promise<WriteResult> =>
      withLiara(async (client) => {
        await client.createDomain({ name: domain, project: name });
        return { ok: true as const, summary: `Added domain ${domain} to ${name}.` };
      }),
  }),

  enable_ssl: tool({
    description:
      "Enable the free SSL certificate for a domain already added and pointed at Liara (POST /v1/domains/provision-ssl-certs). Runs only after approval.",
    inputSchema: z.object({
      name: appName,
      domain: z.string().min(3).max(253),
    }),
    execute: async ({ domain }): Promise<WriteResult> =>
      withLiara(async (client) => {
        await client.enableSsl(domain);
        return { ok: true as const, summary: `SSL requested for ${domain}.` };
      }),
  }),

  generate_deploy_prompt: tool({
    description:
      "Show the deploy prompt YOU wrote as a copyable card, so the user can paste it into any AI coding agent (Claude Code, Cursor, Codex) to deploy their local project to Liara. Write the full prompt yourself from this conversation: stack, platform, port, plan, env var KEYS, domain, team. Never include tokens or env values. Do not call this to create the prompt; call it to present the finished text.",
    inputSchema: z.object({
      appName: z.string().min(1).max(60),
      target: z.enum(["claude-code", "cursor", "codex", "generic"]).optional(),
      prompt: z.string().min(40).max(8000).describe("The complete prompt text, written by you."),
    }),
    execute: async ({ appName, target, prompt }): Promise<DeployPromptResult> => {
      const ctx = await liaraContext();
      return {
        prompt: redact(prompt, ctx ? [ctx.token] : []),
        target: target ?? "generic",
        appName,
      };
    },
  }),

  liara_api_search: tool({
    description:
      "Search the official Liara API (developers.liara.ir): 170 operations across paas, dbaas, object-storage, iaas, ai-workspaces, dns, mail and me. Returns method, path, parameters and request body shape. ALWAYS search here before telling the user something is impossible, then call liara_api_get / liara_api_write.",
    inputSchema: z.object({
      query: z.string().min(2).max(200),
      service: z.string().max(40).optional().describe(`One of: ${servicesList().join(", ")}`),
    }),
    execute: async ({ query, service }) => ({
      results: searchOperations(query, service, 6).map((op) => ({
        service: op.service,
        method: op.method,
        path: op.path,
        summary: op.summary,
        description: op.description,
        parameters: op.params,
        body: op.body,
        source: op.source,
        note: op.note,
      })),
    }),
  }),

  liara_api_get: tool({
    description:
      "Call any documented READ (GET) endpoint of the Liara API. path is the concrete path, e.g. /v1/databases/<id>. The call is validated against the official specs.",
    inputSchema: z.object({
      service: z.string().max(40),
      path: z.string().min(1).max(300),
      query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    }),
    execute: async ({ service, path, query }) => {
      const op = matchOperation(service, "GET", path);
      if (!op) return { error: `No documented GET ${path} in service ${service}. Use liara_api_search.` };
      return withLiara(async (client, token) => {
        void client;
        const ctx = await liaraContext();
        const data = await liaraRawRequest(token, {
          url: op.server + path.split("?")[0],
          method: "GET",
          query,
          teamId: ctx?.teamId ?? undefined,
        });
        return limitJson(data);
      });
    },
  }),

  liara_api_write: tool({
    description:
      "Call any documented WRITE endpoint of the Liara API (POST/PUT/PATCH/DELETE): create databases, buckets, disks, DNS records, VMs, mail servers and so on. Runs only after the user approves. Validated against the official specs; file uploads are not supported here (use deploy_project). Explain the effect in one sentence in `reason`.",
    inputSchema: z.object({
      service: z.string().max(40),
      method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().min(1).max(300),
      query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      reason: z.string().min(3).max(300),
    }),
    execute: async ({ service, method, path, query, body }) => {
      const op = matchOperation(service, method, path);
      if (!op) return { error: `No documented ${method} ${path} in service ${service}. Use liara_api_search.` };
      if (op.body?.contentType.startsWith("multipart")) {
        return { error: "This endpoint uploads a file; use deploy_project for source uploads." };
      }
      return withLiara(async (_client, token) => {
        const ctx = await liaraContext();
        const data = await liaraRawRequest(token, {
          url: op.server + path.split("?")[0],
          method: method as "POST",
          query,
          body,
          teamId: ctx?.teamId ?? undefined,
        });
        return { ok: true as const, summary: `${method} ${path} succeeded.`, response: limitJson(data) };
      });
    },
  }),

  get_build_logs: tool({
    description:
      "Get the BUILD output of a release (the deploy build: npm install, docker build, image push) and the release state and failReason. Use this, not get_logs, to find out why a deploy or build failed. Give a releaseID (from deploy_project / list_releases) or just the app name for the newest release.",
    inputSchema: z.object({
      name: appName,
      releaseID: z.string().min(1).max(100).optional(),
    }),
    execute: async ({ name, releaseID }): Promise<GetLogsResult> =>
      withLiara(async (client, token) => {
        const id = releaseID ?? (await newestReleaseId(client, name));
        if (!id) return { error: `${name} has no releases yet.` } as never;
        const body = await client.getBuildLogs(id);
        const lines = (body.buildOutput ?? []).map((entry) => ({
          time: entry.createdAt,
          type: entry.stream === "STDOUT" ? "stdout" : "stderr",
          message: redact((entry.line ?? "").replace(/\r?\n$/, ""), [token]),
        }));
        return {
          name,
          since: id,
          count: lines.length,
          truncated: lines.length > BUILD_LOG_LIMIT,
          lines: lines.slice(-BUILD_LOG_LIMIT),
          releaseID: id,
          release: {
            state: body.release?.state,
            failReason: body.release?.failReason,
            queue: body.release?.queue,
          },
        } as GetLogsResult;
      }),
  }),

  wait_for_release: tool({
    description:
      "Wait for a deploy to finish. Polls the release every 3 seconds for up to about 45 seconds and returns as soon as the release is READY or ends badly (FAILED, UNHEALTHY, CANCELED, TIMEDOUT), together with the latest build output. If it returns done:false the build is still running: call it again. Always use this after deploy_project / deploy_image instead of guessing. Read only.",
    inputSchema: z.object({
      name: appName,
      releaseID: z.string().min(1).max(100).optional(),
    }),
    execute: async ({ name, releaseID }, options): Promise<WaitForReleaseResult> =>
      withLiara(async (client, token) => {
        const id = releaseID ?? (await newestReleaseId(client, name));
        if (!id) return { error: `${name} has no releases yet.` } as never;
        const deadline = Date.now() + 45_000;
        let since: string | undefined;
        let tail: Array<{ time?: string; type: string; message: string }> = [];
        let state: string | undefined;
        let failReason: string | undefined;
        let attempts = 0;
        while (true) {
          attempts++;
          const body = await client.getBuildLogs(id, since);
          state = body.release?.state ?? state;
          failReason = body.release?.failReason ?? failReason;
          const output = body.buildOutput ?? [];
          if (output.length > 0) {
            since = output[output.length - 1].createdAt ?? since;
            tail = [
              ...tail,
              ...output.map((entry) => ({
                time: entry.createdAt,
                type: entry.stream === "STDOUT" ? "stdout" : "stderr",
                message: redact((entry.line ?? "").replace(/\r?\n$/, ""), [token]),
              })),
            ].slice(-BUILD_LOG_LIMIT);
          }
          const failedStream = output.some((entry) => entry.stream !== "STDOUT");
          const terminal = state !== undefined && ["READY", "FAILED", "UNHEALTHY", "CANCELED", "TIMEDOUT"].includes(state);
          if (terminal || failedStream || Date.now() >= deadline || options.abortSignal?.aborted) break;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        const done = state === "READY";
        const failed = !done && (["FAILED", "UNHEALTHY", "CANCELED", "TIMEDOUT"].includes(state ?? "") || tail.some((l) => l.type === "stderr"));
        return {
          done: done || failed,
          succeeded: done,
          state: state ?? "UNKNOWN",
          failReason,
          releaseID: id,
          attempts,
          buildTail: tail.slice(-60),
        };
      }),
  }),

  inspect_repo: tool({
    description:
      "Inspect a PUBLIC code repository (GitHub link or https .tar.gz) before deploying: returns the file tree, detected language and framework, package manager, scripts, Dockerfile/compose, env var names from .env.example or .env, databases it needs, README start, and a platform/port hint. Always call this first when the user gives a repo, instead of asking them what it is built with. Read only.",
    inputSchema: z.object({
      sourceUrl: z.string().url().max(500),
      branch: z.string().min(1).max(100).optional(),
    }),
    execute: async ({ sourceUrl, branch }) => {
      try {
        return await inspectRepo(sourceUrl, branch);
      } catch (error) {
        return { error: error instanceof SourceError ? error.message : "Could not inspect the repository." };
      }
    },
  }),

  read_repo_file: tool({
    description:
      "Read one text file (up to 8000 characters) from a public repository, e.g. package.json, astro.config.mjs, Dockerfile, prisma/schema.prisma, src/server.js. The repo is public, so any file (including .env files committed to it) can be read. Read only.",
    inputSchema: z.object({
      sourceUrl: z.string().url().max(500),
      path: z.string().min(1).max(200),
      branch: z.string().min(1).max(100).optional(),
    }),
    execute: async ({ sourceUrl, path, branch }) => {
      try {
        return await readRepoFile(sourceUrl, path, branch);
      } catch (error) {
        return { error: error instanceof SourceError ? error.message : "Could not read that file." };
      }
    },
  }),

  liara_api_batch_get: tool({
    description:
      "Run up to 12 documented GET calls of the Liara API at once (in parallel) and get all results together. Use it to gather several facts in one step (for example apps, databases, domains, plans, networks) instead of many single calls. Each entry is validated against the specs. Read only.",
    inputSchema: z.object({
      calls: z
        .array(
          z.object({
            service: z.string().max(40),
            path: z.string().min(1).max(300),
            query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
          }),
        )
        .min(1)
        .max(12),
    }),
    execute: async ({ calls }) => {
      const ctx = await liaraContext();
      if (!ctx) return { error: TOKEN_MISSING };
      const results = await Promise.all(
        calls.map(async (call) => {
          const op = matchOperation(call.service, "GET", call.path);
          if (!op) return { path: call.path, error: `No documented GET ${call.path} in ${call.service}.` };
          try {
            const data = await liaraRawRequest(ctx.token, {
              url: op.server + call.path.split("?")[0],
              method: "GET",
              query: call.query,
              teamId: ctx.teamId ?? undefined,
            });
            return { path: call.path, data: limitJson(scrubLiteral(data, [ctx.token]), 3000) };
          } catch (error) {
            return { path: call.path, ...normalizeLiaraError(error, ctx.token) };
          }
        }),
      );
      return { results };
    },
  }),

  liara_api_batch_write: tool({
    description:
      "Run several documented WRITE calls of the Liara API in order after ONE approval (create a network, then a database, then a disk...). Stops at the first failure and reports which calls ran. Use it when the plan is clear and the steps do not depend on each other's response values; otherwise use liara_api_write step by step. Explain the whole batch in `reason`.",
    inputSchema: z.object({
      calls: z
        .array(
          z.object({
            service: z.string().max(40),
            method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
            path: z.string().min(1).max(300),
            query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
            body: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .min(1)
        .max(10),
      reason: z.string().min(3).max(400),
    }),
    execute: async ({ calls }) => {
      const ctx = await liaraContext();
      if (!ctx) return { error: TOKEN_MISSING };
      for (const call of calls) {
        const op = matchOperation(call.service, call.method, call.path);
        if (!op) return { error: `No documented ${call.method} ${call.path} in ${call.service}. Nothing was run.` };
        if (op.body?.contentType.startsWith("multipart")) return { error: "A call uploads a file; use deploy_project. Nothing was run." };
      }
      const done: Array<{ method: string; path: string; response: unknown }> = [];
      for (const call of calls) {
        const op = matchOperation(call.service, call.method, call.path)!;
        try {
          const data = await liaraRawRequest(ctx.token, {
            url: op.server + call.path.split("?")[0],
            method: call.method as "POST",
            query: call.query,
            body: call.body,
            teamId: ctx.teamId ?? undefined,
          });
          done.push({ method: call.method, path: call.path, response: limitJson(scrubLiteral(data, [ctx.token]), 1500) });
        } catch (error) {
          return {
            ...normalizeLiaraError(error, ctx.token),
            completed: done,
            failedAt: { method: call.method, path: call.path },
            notRun: calls.length - done.length - 1,
          };
        }
      }
      return { ok: true as const, summary: `${done.length} call(s) succeeded.`, completed: done };
    },
  }),

  wait_for_liara: tool({
    description:
      "Wait until something on Liara is ready. Polls a documented GET path every 3 seconds for up to about 45 seconds, then returns. Stops when the JSON field at `field` equals `equals`, or (with `pending`) when the field's value is no longer one of the pending values. Use it after creating a database (GET /v1/databases/{id}, field database.status) or a release. If it times out, call it again or report the last value. Read only.",
    inputSchema: z.object({
      service: z.string().max(40),
      path: z.string().min(1).max(300).describe("Concrete GET path, e.g. /v1/databases/<id>."),
      query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      field: z
        .string()
        .min(1)
        .max(200)
        .describe("Dot path to the value in the JSON response, e.g. database.status."),
      equals: z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe("Stop when the field equals this (compared as text, e.g. RUNNING)."),
      pending: z
        .array(z.string().max(80))
        .max(10)
        .optional()
        .describe("Values that mean 'still working'. Stop when the field is no longer one of them."),
    }),
    execute: async (
      { service, path, query, field, equals, pending },
      options,
    ): Promise<WaitForLiaraResult> => {
      const op = matchOperation(service, "GET", path);
      if (!op) {
        return { error: `No documented GET ${path} in service ${service}. Use liara_api_search.` };
      }
      if (equals === undefined && !pending?.length) {
        return { error: "Give `equals` or `pending` so the tool knows what to wait for." };
      }
      const ctx = await liaraContext();
      if (!ctx) return { error: TOKEN_MISSING };
      const started = Date.now();
      let attempts = 0;
      let value: unknown;
      for (;;) {
        attempts += 1;
        try {
          const data = await liaraRawRequest(ctx.token, {
            url: op.server + path.split("?")[0],
            method: "GET",
            query,
            teamId: ctx.teamId ?? undefined,
          });
          value = readField(data, field);
          const text = value === undefined || value === null ? undefined : String(value);
          const matched = equals !== undefined && text === String(equals);
          const left = !matched && !!pending?.length && text !== undefined && !pending.includes(text);
          if (matched || left) {
            return scrubLiteral(
              {
                done: true,
                timedOut: false,
                reason: matched ? ("matched" as const) : ("left_pending" as const),
                attempts,
                value: limitJson(value, 500),
                path,
                field,
              },
              [ctx.token],
            );
          }
        } catch (error) {
          const transient =
            error instanceof LiaraError &&
            (error.kind === "network" || error.kind === "server" || error.kind === "rate_limited");
          if (!transient) return failureResult(error, ctx.token);
        }
        if (options.abortSignal?.aborted || Date.now() - started + WAIT_INTERVAL_MS > WAIT_MAX_MS) {
          return scrubLiteral(
            {
              done: false,
              timedOut: true,
              reason: "timeout" as const,
              attempts,
              value: limitJson(value, 500),
              path,
              field,
            },
            [ctx.token],
          );
        }
        await sleep(WAIT_INTERVAL_MS, options.abortSignal);
      }
    },
  }),

  deploy_image: tool({
    description:
      "Deploy a public Docker image (Docker Hub or ghcr.io) to an existing app of platform docker: POST /v2/projects/{name}/releases with { type: 'docker', image, port, envs, disks }. Runs only after approval. The release fields beyond sourceID/port/type come from the Liara CLI source, not the public spec. Create disks first (liara_api_write on /v1/projects/{name}/disks) if the image needs persistent storage. Verify afterwards with list_releases and get_logs.",
    inputSchema: z.object({
      name: appName,
      image: z.string().min(2).max(300).describe("e.g. ghcr.io/umami-software/umami:postgresql-latest"),
      port: z.number().int().min(1).max(65535),
      envs: z
        .array(z.object({ key: z.string().regex(ENV_KEY), value: z.string().max(8192) }))
        .max(50)
        .optional(),
      disks: z
        .array(z.object({ name: z.string().min(1).max(60), mountTo: z.string().min(1).max(200) }))
        .max(5)
        .optional(),
      args: z.array(z.string().max(200)).max(20).optional(),
    }),
    execute: async ({ name, image, port, envs, disks, args }): Promise<DeployResult> =>
      withLiara(async (client) => {
        const release = await client.deployRelease(name, {
          type: "docker",
          port,
          image,
          ...(envs?.length ? { envs } : {}),
          ...(disks?.length ? { disks } : {}),
          ...(args?.length ? { args } : {}),
        } as never);
        return {
          ok: true as const,
          summary: `Deployment of image ${image} to ${name} started.`,
          name,
          releaseID: release.releaseID,
          port,
          platform: "docker",
        };
      }),
  }),

  ask_user: tool({
    description:
      "Ask the user one or more clarifying questions. The UI collects the answers and returns them as { answers: { [questionId]: text } }. Use options for choices and allowFreeform for free text.",
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            question: z.string().min(1).max(400),
            options: z.array(z.string().min(1).max(120)).max(8).optional(),
            allowFreeform: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(4),
    }),
  }),

  propose_architecture: tool({
    description:
      "Show a proposed Liara architecture as a diagram in the chat (apps, databases, object storage, domains, email, cache). Nodes are shown as returned; this does not change anything.",
    inputSchema: z.object({
      nodes: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            label: z.string().min(1).max(60),
            kind: z.enum(ARCHITECTURE_KINDS),
            detail: z.string().max(160).optional(),
          }),
        )
        .min(1)
        .max(20),
      edges: z
        .array(
          z.object({
            from: z.string().min(1).max(40),
            to: z.string().min(1).max(40),
            label: z.string().max(60).optional(),
          }),
        )
        .max(40),
    }),
    execute: async ({ nodes, edges }): Promise<ArchitectureResult> => ({
      shown: true as const,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    }),
  }),
} satisfies ToolSet;

export type AgentToolName = keyof typeof ALL_TOOLS;

const WRITE_SET = new Set<string>(WRITE_TOOL_NAMES);

const APP_NAME_TOOLS = new Set<string>([
  "get_project",
  "get_logs",
  "get_build_logs",
  "wait_for_release",
  "get_metrics",
  "list_releases",
  "get_events",
  "restart_project",
  "set_project_scale",
  "resize_project",
  "update_env_vars",
  "list_domains",
  "deploy_project",
  "add_domain",
  "enable_ssl",
  "deploy_image",
]);

const FINDING_ID_INPUT: Record<string, string> = {
  get_finding: "id",
  generate_fix_prompt: "findingId",
};

const WHOLE_ACCOUNT_TOOLS = new Set<string>([
  "run_health_check",
  "liara_api_get",
  "liara_api_write",
  "liara_api_batch_get",
  "liara_api_batch_write",
  "wait_for_liara",
  "create_database",
]);

async function scopeViolation(
  name: string,
  input: Record<string, unknown>,
  scope: readonly ResourceRef[],
): Promise<ToolErrorResult | null> {
  if (WHOLE_ACCOUNT_TOOLS.has(name)) {
    return {
      error:
        "This tool reaches the whole account, so it is not available while resources are attached. Remove the attachments to use it.",
    };
  }
  if (APP_NAME_TOOLS.has(name)) {
    return appIsAttached(scope, input.name)
      ? null
      : { error: notAttachedMessage(String(input.name)) };
  }
  const idKey = FINDING_ID_INPUT[name];
  if (idKey) {
    try {
      const row = await getFinding(String(input[idKey]));
      if (row && !appIsAttached(scope, row.projectName)) {
        return { error: notAttachedMessage(row.projectName) };
      }
    } catch {
      return { error: "Could not check which app this finding belongs to." };
    }
  }
  return null;
}

function filterToScope(name: string, result: unknown, scope: readonly ResourceRef[]): unknown {
  if (typeof result !== "object" || result === null) return result;
  if (name === "list_projects" && "projects" in result && Array.isArray(result.projects)) {
    return {
      ...result,
      projects: result.projects.filter((project: { name: string }) =>
        appIsAttached(scope, project.name),
      ),
    };
  }
  if (name === "list_findings" && "findings" in result && Array.isArray(result.findings)) {
    return {
      ...result,
      findings: result.findings.filter((finding: { projectName: string }) =>
        appIsAttached(scope, finding.projectName),
      ),
    };
  }
  return result;
}

function scopedTool(name: string, definition: Tool<any, any>, scope: readonly ResourceRef[]) {
  const execute = definition.execute;
  if (scope.length === 0 || !execute) return definition;
  return {
    ...definition,
    execute: async (input: unknown, options: ToolExecutionOptions<never>) => {
      const violation = await scopeViolation(name, input as Record<string, unknown>, scope);
      if (violation) return violation;
      return filterToScope(name, await execute(input, options), scope);
    },
  } as Tool<any, any>;
}

/**
 * With no attachments the tools behave as before. With any attachment, app tools
 * and finding tools only reach attached apps; the scope comes from the server-verified request.
 */
export function buildAgentTools(
  mode: AgentMode,
  scope: readonly ResourceRef[] = [],
): {
  tools: ToolSet;
  toolApproval: Record<string, "user-approval">;
} {
  const tools: ToolSet = {};
  const toolApproval: Record<string, "user-approval"> = {};
  for (const name of MODE_TOOL_NAMES[mode]) {
    const definition = ALL_TOOLS[name as AgentToolName];
    if (!definition) continue;
    tools[name] = scopedTool(name, definition, scope);
    if (WRITE_SET.has(name)) toolApproval[name] = "user-approval";
  }
  return { tools, toolApproval };
}
