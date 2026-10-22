import type { AttachableResource, ResourceType } from "@/lib/agent/scope";
import { createLiaraClient, LiaraError, type LiaraErrorKind } from "./client";
import type { Inventory, InventorySection } from "./inventory";
import type { ResourceTag } from "./tags";

const DBAAS_BASE_URL = "https://api.liara.ir";
const STORAGE_BASE_URL = "https://storage-service.liara.ir";
const TIMEOUT_MS = 15_000;

export type ResourcesSection =
  | { ok: true; items: AttachableResource[] }
  | { ok: false; kind: LiaraErrorKind; message: string };

export type ResourcesResponse =
  | { connected: false }
  | ({
      connected: true;
      inventory: Inventory;
      tags: ResourceTag[];
    } & LegacyResourceSections);

/** Attachable-picker view of apps, databases and buckets. Derived from the inventory. */
export type LegacyResourceSections = {
  apps: ResourcesSection;
  databases: ResourcesSection;
  buckets: ResourcesSection;
};

export function describeLiaraError(error: unknown): { kind: LiaraErrorKind; message: string } {
  const kind = error instanceof LiaraError ? error.kind : "unknown";
  return describeLiaraKind(kind);
}

export function describeLiaraKind(kind: LiaraErrorKind): { kind: LiaraErrorKind; message: string } {
  switch (kind) {
    case "auth":
      return { kind, message: "Liara rejected the saved token. Check it in Settings." };
    case "rate_limited":
      return { kind, message: "Liara rate limit reached. Try again shortly." };
    case "network":
      return { kind, message: "Could not reach Liara." };
    case "server":
      return { kind, message: "Liara returned a server error." };
    case "not_found":
      return { kind, message: "Not found on this Liara account." };
    default:
      return { kind, message: "Unexpected response from Liara." };
  }
}

export function legacySections(inventory: Inventory): LegacyResourceSections {
  return {
    apps: fromInventory(inventory.app, "app", ["type", "status"]),
    databases: fromInventory(inventory.database, "database", ["type", "status"]),
    buckets: fromInventory(inventory.bucket, "bucket", ["plan", "permission"]),
  };
}

function fromInventory(
  section: InventorySection,
  type: ResourceType,
  detailKeys: readonly string[],
): ResourcesSection {
  if (!section.ok) {
    return { ok: false, ...describeLiaraKind(section.error ?? "unknown") };
  }
  return {
    ok: true,
    items: section.items.map((item) => ({
      type,
      id: item.id,
      name: item.name,
      detail: joinDetail(detailKeys.map((key) => metaText(item.meta?.[key]))),
    })),
  };
}

function metaText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function listAttachableResources(
  token: string,
  type: ResourceType,
  teamId?: string,
): Promise<AttachableResource[]> {
  switch (type) {
    case "app":
      return listApps(token, teamId);
    case "database":
      return listDatabases(token, teamId);
    case "bucket":
      return listBuckets(token, teamId);
  }
}

export async function listApps(token: string, teamId?: string): Promise<AttachableResource[]> {
  const { projects } = await createLiaraClient(token, { teamId }).listProjects();
  return projects.map((project) => ({
    type: "app",
    id: project.project_id,
    name: project.project_id,
    detail: joinDetail([project.type, project.status]),
  }));
}

export async function listDatabases(token: string, teamId?: string): Promise<AttachableResource[]> {
  const body = await getJson(`${DBAAS_BASE_URL}/v1/databases`, token, teamId);
  return records(body, "databases").flatMap((database) => {
    const id = text(database.DBId) ?? text(database.id);
    if (!id) return [];
    return [
      {
        type: "database",
        id,
        name: text(database.hostname) ?? id,
        detail: joinDetail([text(database.type), text(database.status)]),
      },
    ];
  });
}

export async function listBuckets(token: string, teamId?: string): Promise<AttachableResource[]> {
  const body = await getJson(`${STORAGE_BASE_URL}/api/v1/buckets`, token, teamId);
  return records(body, "buckets").flatMap((bucket) => {
    const id = text(bucket.id);
    if (!id) return [];
    return [
      {
        type: "bucket",
        id,
        name: text(bucket.name) ?? id,
        detail: joinDetail([text(bucket.plan), text(bucket.permission)]),
      },
    ];
  });
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function joinDetail(parts: Array<string | undefined>): string | undefined {
  const value = parts.filter((part): part is string => part !== undefined).join(" · ");
  return value.length > 0 ? value : undefined;
}

function records(body: unknown, key: string): Record<string, unknown>[] {
  if (typeof body !== "object" || body === null || !(key in body)) return [];
  const list = (body as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );
}

async function getJson(rawUrl: string, token: string, teamId?: string): Promise<unknown> {
  const url = new URL(rawUrl);
  if (teamId) url.searchParams.set("teamID", teamId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      throw new LiaraError(
        "network",
        controller.signal.aborted ? "Liara API request timed out" : "Could not reach the Liara API",
        null,
      );
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
