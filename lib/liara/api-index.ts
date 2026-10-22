import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export type ApiOperation = {
  service: string;
  server: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  operationId: string;
  tag: string;
  params: Array<{ name: string; in: string; required: boolean; type: string; description?: string }>;
  body?: { contentType: string; schema: unknown };
  /** Where this operation is documented: the official spec or the Liara CLI source. */
  source?: "spec" | "liara-cli";
  note?: string;
};

type Json = Record<string, any>;
const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const DIR = path.join(process.cwd(), "data", "liara-api");

function resolveRef(root: Json, ref: string): Json {
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce<Json>((node, key) => node?.[key.replace(/~1/g, "/")], root) ?? {};
}

function compact(root: Json, schema: Json | undefined, depth = 0): unknown {
  if (!schema) return undefined;
  if (schema.$ref) return compact(root, resolveRef(root, schema.$ref), depth);
  if (depth > 4) return schema.type ?? "object";
  if (schema.type === "array") return [compact(root, schema.items, depth + 1)];
  if (schema.properties) {
    const required = new Set<string>(schema.required ?? []);
    return Object.fromEntries(
      Object.entries<Json>(schema.properties).map(([key, value]) => {
        const inner = compact(root, value, depth + 1);
        const note = [required.has(key) ? "required" : null, value.description ?? null]
          .filter(Boolean)
          .join("; ");
        return [
          key,
          typeof inner === "string" || inner === undefined
            ? [inner ?? "any", value.enum ? `one of ${value.enum.join("|")}` : null, note || null]
                .filter(Boolean)
                .join(" - ")
            : inner,
        ];
      }),
    );
  }
  return schema.type ?? "any";
}

let cache: ApiOperation[] | null = null;

export function apiOperations(): ApiOperation[] {
  if (cache) return cache;
  const operations: ApiOperation[] = [];
  for (const file of readdirSync(DIR).filter((name) => name.endsWith(".yaml"))) {
    const service = file.replace(/\.yaml$/, "");
    const root = parse(readFileSync(path.join(DIR, file), "utf8")) as Json;
    const server: string = root.servers?.[0]?.url ?? "https://api.liara.ir";
    for (const [route, item] of Object.entries<Json>(root.paths ?? {})) {
      for (const method of METHODS) {
        const op = item[method];
        if (!op) continue;
        const rawParams = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p: Json) =>
          p.$ref ? resolveRef(root, p.$ref) : p,
        );
        const content = op.requestBody?.content ?? {};
        const contentType = Object.keys(content)[0];
        operations.push({
          service,
          server: server.replace(/\/$/, ""),
          method: method.toUpperCase() as ApiOperation["method"],
          path: route,
          summary: op.summary ?? "",
          description: op.description ?? "",
          operationId: op.operationId ?? "",
          tag: op.tags?.[0] ?? "",
          params: rawParams.map((p: Json) => ({
            name: p.name,
            in: p.in,
            required: p.required === true,
            type: p.schema?.type ?? "string",
            description: p.description,
          })),
          body: contentType
            ? { contentType, schema: compact(root, content[contentType]?.schema) }
            : undefined,
        });
      }
    }
  }
  const extra = JSON.parse(readFileSync(path.join(DIR, "cli-supplement.json"), "utf8")) as {
    operations: Array<Omit<ApiOperation, "server" | "operationId" | "tag" | "params">>;
    overrides: Array<{ method: string; path: string; note: string; schema: unknown }>;
  };
  for (const op of operations) op.source = "spec";
  for (const add of extra.operations) {
    const server = operations.find((op) => op.service === add.service)?.server ?? "https://api.liara.ir";
    const params = [...add.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      type: "string",
    }));
    operations.push({ ...add, server, operationId: "", tag: "CLI", params, source: "liara-cli" });
  }
  for (const override of extra.overrides) {
    const target = operations.find((op) => op.method === override.method && op.path === override.path);
    if (!target) continue;
    target.note = override.note;
    target.body = { contentType: target.body?.contentType ?? "application/json", schema: override.schema };
  }
  cache = operations;
  return operations;
}

export function searchOperations(query: string, service?: string, limit = 8): ApiOperation[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const pool = apiOperations().filter((op) => !service || op.service === service);
  return pool
    .map((op) => {
      const hay = `${op.service} ${op.tag} ${op.summary} ${op.description} ${op.note ?? ""} ${op.operationId} ${op.method} ${op.path}`.toLowerCase();
      const score = words.reduce((sum, w) => sum + (hay.includes(w) ? (op.summary.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
      return { op, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.op);
}

export function servicesList(): string[] {
  return [...new Set(apiOperations().map((op) => op.service))];
}

/** Finds the documented operation for a concrete path, e.g. /v1/databases/abc/resize. */
export function matchOperation(service: string, method: string, concrete: string): ApiOperation | null {
  const clean = concrete.split("?")[0].replace(/\/+$/, "") || "/";
  for (const op of apiOperations()) {
    if (op.service !== service || op.method !== method) continue;
    const pattern = new RegExp(
      "^" + op.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+") + "$",
    );
    if (pattern.test(clean)) return op;
  }
  return null;
}
