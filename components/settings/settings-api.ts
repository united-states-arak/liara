export type LiaraStatus = {
  connected: boolean;
  tokenMask: string | null;
  account?: { name?: string; email?: string };
  checkedAt: string;
  error?: { kind: string; message: string };
};

export type AiConfig = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  source: "ui" | "env" | "default";
};

export type AiTestResult = {
  ok: boolean;
  status: number | null;
  message: string;
};

export const LIARA_STATUS_KEY = ["settings", "liara"] as const;
export const AI_CONFIG_KEY = ["settings", "ai"] as const;

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}
