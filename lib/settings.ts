import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const { settings } = schema;

const KEYS = {
  liaraToken: "liara.token",
  liaraTeamId: "liara.teamId",
  aiBaseUrl: "ai.baseUrl",
  aiModel: "ai.model",
  aiApiKey: "ai.apiKey",
} as const;

const DEFAULT_AI_BASE_URL = "https://api.avalai.ir/v1";
const DEFAULT_AI_MODEL = "gpt-6-luna";

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export type AiConfig = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  source: "ui" | "env" | "default";
};

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length < 12) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function readRow(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ value: settings.value, encrypted: settings.encrypted })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  const row = rows[0];
  if (!row || row.value === "") return null;
  return row.encrypted ? readDecrypted(key, row.value) : row.value;
}

function readDecrypted(key: string, payload: string): string {
  try {
    return decryptSecret(payload);
  } catch {
    throw new Error(`Stored setting "${key}" cannot be decrypted. Check APP_ENCRYPTION_KEY.`);
  }
}

async function writeRow(key: string, value: string, encrypted: boolean) {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(settings)
    .values({ key, value, encrypted, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, encrypted, updatedAt: now },
    });
}

async function deleteRow(key: string) {
  const db = await getDb();
  await db.delete(settings).where(eq(settings.key, key));
}

async function hasRow(key: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows.length > 0;
}

export function parseBaseUrl(input: string): string {
  const value = input.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SettingsValidationError("Base URL must be a valid URL.");
  }
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new SettingsValidationError(
      "Base URL must use https (http is only allowed for localhost).",
    );
  }
  if (url.username || url.password) {
    throw new SettingsValidationError("Base URL must not contain credentials.");
  }
  if (url.search || url.hash) {
    throw new SettingsValidationError("Base URL must not contain a query string or fragment.");
  }
  return url.toString().replace(/\/+$/, "");
}

export async function getLiaraToken(): Promise<string | null> {
  const stored = await readRow(KEYS.liaraToken);
  return stored ?? envValue("LIARA_API_TOKEN");
}

export async function setLiaraToken(token: string): Promise<void> {
  const value = token.trim();
  if (!value) {
    throw new SettingsValidationError("Token is required.");
  }
  if (/\s/.test(value)) {
    throw new SettingsValidationError("Token must not contain spaces.");
  }
  await writeRow(KEYS.liaraToken, encryptSecret(value), true);
}

export async function clearLiaraToken(): Promise<void> {
  await deleteRow(KEYS.liaraToken);
}

export async function getLiaraTokenMask(): Promise<string | null> {
  return maskSecret(await getLiaraToken());
}

/** The selected team ID, or null for the personal account. */
export async function getSelectedTeamId(): Promise<string | null> {
  return readRow(KEYS.liaraTeamId);
}

/** Pass null to select the personal account. Stored as plain text. */
export async function setSelectedTeamId(id: string | null): Promise<void> {
  const value = id?.trim() ?? "";
  if (!value) {
    await deleteRow(KEYS.liaraTeamId);
    return;
  }
  if (/\s/.test(value)) {
    throw new SettingsValidationError("Team ID must not contain spaces.");
  }
  await writeRow(KEYS.liaraTeamId, value, false);
}

/** Token and selected team for server-side Liara calls. Null when no token is configured. */
export type LiaraContext = { token: string; teamId: string | null };

export async function liaraContext(): Promise<LiaraContext | null> {
  const token = await getLiaraToken();
  if (!token) return null;
  return { token, teamId: await getSelectedTeamId() };
}

async function resolveAi() {
  const [storedBaseUrl, storedModel, storedApiKey, hasUiConfig] = await Promise.all([
    readRow(KEYS.aiBaseUrl),
    readRow(KEYS.aiModel),
    readRow(KEYS.aiApiKey),
    Promise.all([hasRow(KEYS.aiBaseUrl), hasRow(KEYS.aiModel), hasRow(KEYS.aiApiKey)]).then(
      (flags) => flags.some(Boolean),
    ),
  ]);

  const envBaseUrl = envValue("AVALAI_BASE_URL");
  const envModel = envValue("AVALAI_MODEL");
  const envApiKey = envValue("AVALAI_API_KEY");

  const source: AiConfig["source"] = hasUiConfig
    ? "ui"
    : envBaseUrl || envModel || envApiKey
      ? "env"
      : "default";

  return {
    baseUrl: storedBaseUrl ?? envBaseUrl ?? DEFAULT_AI_BASE_URL,
    model: storedModel ?? envModel ?? DEFAULT_AI_MODEL,
    apiKey: storedApiKey ?? envApiKey,
    source,
  };
}

export async function getAiConfig(): Promise<AiConfig> {
  const ai = await resolveAi();
  return {
    baseUrl: ai.baseUrl,
    model: ai.model,
    hasApiKey: ai.apiKey !== null,
    apiKeyMask: maskSecret(ai.apiKey),
    source: ai.source,
  };
}

export async function getAiApiKey(): Promise<string | null> {
  return (await resolveAi()).apiKey;
}

export async function setAiConfig(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<void> {
  const writes: Array<() => Promise<void>> = [];

  if (input.baseUrl !== undefined) {
    const baseUrl = parseBaseUrl(input.baseUrl);
    writes.push(() => writeRow(KEYS.aiBaseUrl, baseUrl, false));
  }

  if (input.model !== undefined) {
    const model = input.model.trim();
    if (!model) {
      throw new SettingsValidationError("Model is required.");
    }
    if (/\s/.test(model)) {
      throw new SettingsValidationError("Model must not contain spaces.");
    }
    writes.push(() => writeRow(KEYS.aiModel, model, false));
  }

  if (input.apiKey !== undefined) {
    const apiKey = input.apiKey.trim();
    if (apiKey === "clear") {
      writes.push(() => deleteRow(KEYS.aiApiKey));
    } else if (apiKey !== "") {
      if (/\s/.test(apiKey)) {
        throw new SettingsValidationError("API key must not contain spaces.");
      }
      const payload = encryptSecret(apiKey);
      writes.push(() => writeRow(KEYS.aiApiKey, payload, true));
    }
  }

  for (const write of writes) {
    await write();
  }
}
