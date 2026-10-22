import { NextResponse } from "next/server";
import { getAiConfig, setAiConfig, SettingsValidationError } from "@/lib/settings";

export const dynamic = "force-dynamic";

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SettingsValidationError(`${key} must be a string.`);
  }
  return value;
}

export async function GET() {
  return NextResponse.json(await getAiConfig());
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new SettingsValidationError("Request body must be a JSON object.");
    }
    const input = body as Record<string, unknown>;
    await setAiConfig({
      baseUrl: readOptionalString(input, "baseUrl"),
      model: readOptionalString(input, "model"),
      apiKey: readOptionalString(input, "apiKey"),
    });
    return NextResponse.json(await getAiConfig());
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("settings/ai failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
