import type { UIMessage } from "ai";

export const RESOURCE_TYPES = ["app", "database", "bucket"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceRef = {
  type: ResourceType;
  id: string;
  name: string;
};

export type AttachableResource = ResourceRef & { detail?: string };

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  app: "Apps",
  database: "Databases",
  bucket: "Buckets",
};

export const SCOPE_METADATA_KEY = "liaraScope";

export const MAX_SCOPE_RESOURCES = 50;

const TEXT_MAX_LENGTH = 200;

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (RESOURCE_TYPES as readonly string[]).includes(value);
}

function isShortText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TEXT_MAX_LENGTH &&
    !/\p{Cc}/u.test(value)
  );
}

export function parseScope(value: unknown): ResourceRef[] | null {
  if (!Array.isArray(value) || value.length > MAX_SCOPE_RESOURCES) return null;
  const seen = new Set<string>();
  const refs: ResourceRef[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { type, id, name } = item as Record<string, unknown>;
    if (!isResourceType(type) || !isShortText(id) || !isShortText(name)) return null;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type, id, name });
  }
  return refs;
}

export function scopeFromMetadata(metadata: unknown): ResourceRef[] | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (!(SCOPE_METADATA_KEY in metadata)) return null;
  return parseScope((metadata as Record<string, unknown>)[SCOPE_METADATA_KEY]);
}

export function stampScope(messages: UIMessage[], scope: readonly ResourceRef[]): UIMessage[] {
  const index = messages.findLastIndex((message) => message.role === "user");
  if (index === -1) return messages;
  return messages.map((message, position) => {
    if (position !== index) return message;
    const metadata =
      typeof message.metadata === "object" && message.metadata !== null ? message.metadata : {};
    return { ...message, metadata: { ...metadata, [SCOPE_METADATA_KEY]: scope } };
  });
}

export function appIsAttached(scope: readonly ResourceRef[], name: unknown): boolean {
  return typeof name === "string" && scope.some((ref) => ref.type === "app" && ref.name === name);
}

export function resourceKey(ref: Pick<ResourceRef, "type" | "id">): string {
  return `${ref.type}:${ref.id}`;
}

export function notAttachedMessage(resource: string): string {
  return `Resource ${resource} is not attached to this conversation. Ask the user to attach it.`;
}

export function scopePrompt(scope: readonly ResourceRef[]): string {
  if (scope.length === 0) {
    return "Resource scope: nothing is attached, which means NO restrictions. You may read and change any app, database, bucket, domain, DNS zone, VM or other service on the user's account (writes still need approval), and create new ones. Never ask the user to attach anything or to name an app: find it yourself with list_projects, liara_api_get or liara_api_search, and if several match, pick the obvious one or list them and proceed with the best match.";
  }
  const lines = scope.map(
    (ref) => `- ${ref.type} ${JSON.stringify(ref.name)} (id ${JSON.stringify(ref.id)})`,
  );
  return [
    "Resource scope: the user attached these Liara resources to this conversation. They are the only resources you may read or change.",
    ...lines,
    "Use app tools only with the name of an attached app. list_projects returns only attached apps.",
    "If the user asks about any other resource, say it is not attached and ask them to attach it.",
    "While resources are attached, the account-wide API tools (liara_api_get, liara_api_write, wait_for_liara, create_database) are switched off. Attached databases and buckets are context only; if the user wants to act on them, tell them to remove the attachments to lift the restriction.",
  ].join("\n");
}
