import type { ChecksResponse, FixPromptResponse, FixTarget, RunCheckResponse } from "./types";

export const checksQueryKey = ["checks"] as const;

function readErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  if (typeof message === "string") return message;
  return null;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readErrorMessage(body) ?? `Request failed with status ${res.status}`);
  }
  return body as T;
}

export function fetchChecks() {
  return request<ChecksResponse>("/api/checks");
}

export function runCheck() {
  return request<RunCheckResponse>("/api/checks/run", { method: "POST" });
}

export function fetchFixPrompt(
  findingId: string,
  options: { target?: FixTarget; extraContext?: string },
  signal?: AbortSignal,
) {
  return request<FixPromptResponse>(`/api/findings/${encodeURIComponent(findingId)}/fix-prompt`, {
    method: "POST",
    signal,
    body: JSON.stringify({
      target: options.target,
      extraContext: options.extraContext?.trim() || undefined,
    }),
  });
}
