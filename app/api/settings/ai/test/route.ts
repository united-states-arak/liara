import { NextResponse } from "next/server";
import { getAiApiKey, getAiConfig, parseBaseUrl, SettingsValidationError } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TEST_TIMEOUT_MS = 10_000;

type TestResult = { ok: boolean; status: number | null; message: string };

function result(ok: boolean, status: number | null, message: string) {
  return NextResponse.json({ ok, status, message } satisfies TestResult);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  try {
    const overrideBaseUrl =
      typeof input.baseUrl === "string" && input.baseUrl.trim() !== ""
        ? parseBaseUrl(input.baseUrl)
        : undefined;
    const overrideApiKey =
      typeof input.apiKey === "string" && input.apiKey.trim() !== ""
        ? input.apiKey.trim()
        : undefined;

    const baseUrl = overrideBaseUrl ?? (await getAiConfig()).baseUrl;
    const apiKey = overrideApiKey ?? (await getAiApiKey());
    if (!apiKey) {
      return result(false, null, "No API key configured.");
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return result(
        false,
        null,
        timedOut ? "Timed out after 10 seconds." : "Could not reach the endpoint.",
      );
    }

    if (response.status === 401 || response.status === 403) {
      return result(false, response.status, "The API key was rejected.");
    }
    if (!response.ok) {
      return result(false, response.status, `Endpoint responded with HTTP ${response.status}.`);
    }

    let modelCount: number | undefined;
    try {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "data" in data && Array.isArray(data.data)) {
        modelCount = data.data.length;
      }
    } catch {
      modelCount = undefined;
    }

    return result(
      true,
      response.status,
      modelCount === undefined ? "Connected." : `Connected. ${modelCount} models available.`,
    );
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return result(false, null, error.message);
    }
    console.error(
      "settings/ai/test failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return result(false, null, "Unexpected server error.");
  }
}
