import { createLiaraClient, LiaraError } from "./client";

export const RESOURCE_KINDS = [
  "app",
  "database",
  "bucket",
  "vm",
  "ai_workspace",
  "mail_server",
  "dns_zone",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type MetaValue = string | number | boolean | null;

export type ResourceItem = {
  id: string;
  name: string;
  kind: ResourceKind;
  meta?: Record<string, MetaValue>;
};

export type LiaraServiceClient = {
  token: string;
  /** Sent as the `teamID` query parameter. Omit for the personal account. */
  teamId?: string;
};

export type ServiceAdapter = {
  kind: ResourceKind;
  label: string;
  list(client: LiaraServiceClient): Promise<ResourceItem[]>;
};

const TIMEOUT_MS = 15_000;

const SERVERS = {
  paas: "https://api.liara.ir",
  dbaas: "https://api.liara.ir",
  storage: "https://storage-service.liara.ir",
  iaas: "https://iaas-api.liara.ir",
  ai: "https://ai.liara.ir",
  mail: "https://mail-service.liara.ir",
  dns: "https://dns-service.liara.ir",
} as const;

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function records(value: unknown, key: string, source: unknown): Json[] {
  const list = isRecord(value) ? value[key] : undefined;
  if (!Array.isArray(list)) {
    throw new LiaraError("unknown", `Unexpected ${source} response shape from Liara API`, 200);
  }
  return list.filter(isRecord);
}

function buildMeta(entries: Record<string, unknown>): Record<string, MetaValue> {
  const meta: Record<string, MetaValue> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      meta[key] = value;
    }
  }
  return meta;
}

function item(
  kind: ResourceKind,
  id: string | undefined,
  name: string | undefined,
  meta: Record<string, unknown>,
): ResourceItem[] {
  if (!id) return [];
  return [{ id, name: name ?? id, kind, meta: buildMeta(meta) }];
}

async function liaraGet(
  base: keyof typeof SERVERS,
  path: string,
  client: LiaraServiceClient,
): Promise<unknown> {
  const url = new URL(path, SERVERS[base]);
  if (client.teamId) {
    url.searchParams.set("teamID", client.teamId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${client.token}`, Accept: "application/json" },
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
  if (status === 401 || status === 403) {
    return new LiaraError("auth", `Liara API rejected the token (HTTP ${status})`, status);
  }
  if (status === 404) {
    return new LiaraError("not_found", "Liara resource not found (HTTP 404)", status);
  }
  if (status === 429) {
    const seconds = Number(retryAfter);
    return new LiaraError(
      "rate_limited",
      "Liara API rate limit reached (HTTP 429)",
      status,
      Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined,
    );
  }
  if (status >= 500) {
    return new LiaraError("server", `Liara API server error (HTTP ${status})`, status);
  }
  return new LiaraError("unknown", `Unexpected Liara API response (HTTP ${status})`, status);
}

/** Apps: PaaS GET /v1/projects (paas.yaml). Paths use project_id as the name. */
const apps: ServiceAdapter = {
  kind: "app",
  label: "Apps",
  async list(client) {
    const { projects } = await createLiaraClient(client.token, {
      teamId: client.teamId,
    }).listProjects();
    return projects.flatMap((project) =>
      item("app", project.project_id, project.project_id, {
        type: project.type,
        status: project.status,
        planID: project.planID,
        scale: project.scale,
        isDeployed: project.isDeployed,
        created_at: project.created_at,
      }),
    );
  },
};

/** Databases: DBaaS GET /v1/databases (dbaas.yaml, DBs-details). */
const databases: ServiceAdapter = {
  kind: "database",
  label: "Databases",
  async list(client) {
    const body = await liaraGet("dbaas", "/v1/databases", client);
    return records(body, "databases", "databases").flatMap((db) => {
      const id = str(db.DBId) ?? str(db.id);
      return item("database", id, str(db.hostname) ?? id, {
        type: str(db.type),
        status: str(db.status),
        planID: str(db.planID),
        scale: typeof db.scale === "number" ? db.scale : undefined,
        publicNetwork: typeof db.publicNetwork === "boolean" ? db.publicNetwork : undefined,
        created_at: str(db.created_at),
      });
    });
  },
};

/** Buckets: object-storage GET /api/v1/buckets (List-Bucket, storage-service.liara.ir). */
const buckets: ServiceAdapter = {
  kind: "bucket",
  label: "Buckets",
  async list(client) {
    const body = await liaraGet("storage", "/api/v1/buckets", client);
    return records(body, "buckets", "buckets").flatMap((bucket) => {
      const id = str(bucket.id);
      return item("bucket", id, str(bucket.name), {
        plan: str(bucket.plan),
        status: str(bucket.status),
        permission: str(bucket.permission),
        createdAt: str(bucket.createdAt),
      });
    });
  },
};

/** VMs: IaaS GET /vm (Iaas.yaml, GetVMsResponse, iaas-api.liara.ir). */
const vms: ServiceAdapter = {
  kind: "vm",
  label: "Virtual machines",
  async list(client) {
    const body = await liaraGet("iaas", "/vm", client);
    return records(body, "vms", "vms").flatMap((vm) =>
      item("vm", str(vm._id), str(vm.name), {
        plan: str(vm.plan),
        OS: str(vm.OS),
        state: str(vm.state),
        power: str(vm.power),
        createdAt: str(vm.createdAt),
      }),
    );
  },
};

/** AI workspaces: GET /v1/workspaces (ai-workspaces.yaml, ai.liara.ir). */
const aiWorkspaces: ServiceAdapter = {
  kind: "ai_workspace",
  label: "AI workspaces",
  async list(client) {
    const body = await liaraGet("ai", "/v1/workspaces", client);
    return records(body, "workspaces", "workspaces").flatMap((workspace) =>
      item("ai_workspace", str(workspace._id), str(workspace.name), {
        state: str(workspace.state),
        plan: str(workspace.plan),
        createdAt: str(workspace.createdAt),
        updatedAt: str(workspace.updatedAt),
      }),
    );
  },
};

/** Mail servers: GET /api/v1/mails (mail.yaml, data.mailServers, mail-service.liara.ir). */
const mailServers: ServiceAdapter = {
  kind: "mail_server",
  label: "Mail servers",
  async list(client) {
    const body = await liaraGet("mail", "/api/v1/mails", client);
    const data = isRecord(body) ? body.data : undefined;
    return records(data, "mailServers", "mail servers").flatMap((server) =>
      item("mail_server", str(server.id), str(server.domain), {
        status: str(server.status),
        recordsStatus: str(server.recordsStatus),
        createdAt: str(server.createdAt),
      }),
    );
  },
};

/** DNS zones: GET /api/v1/zones (dns.yaml, data array, dns-service.liara.ir). */
const dnsZones: ServiceAdapter = {
  kind: "dns_zone",
  label: "DNS zones",
  async list(client) {
    const body = await liaraGet("dns", "/api/v1/zones", client);
    const zones = isRecord(body) && Array.isArray(body.data) ? body.data : undefined;
    if (!zones) {
      throw new LiaraError("unknown", "Unexpected zones response shape from Liara API", 200);
    }
    return zones.filter(isRecord).flatMap((zone) =>
      item("dns_zone", str(zone.id), str(zone.name), {
        status: str(zone.status),
        createdAt: str(zone.createdAt),
      }),
    );
  },
};

export const SERVICES: Record<ResourceKind, ServiceAdapter> = {
  app: apps,
  database: databases,
  bucket: buckets,
  vm: vms,
  ai_workspace: aiWorkspaces,
  mail_server: mailServers,
  dns_zone: dnsZones,
};

export function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === "string" && (RESOURCE_KINDS as readonly string[]).includes(value);
}
