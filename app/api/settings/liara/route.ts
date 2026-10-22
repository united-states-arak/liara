import { NextResponse } from "next/server";
import { createLiaraClient } from "@/lib/liara/client";
import {
  clearLiaraToken,
  getLiaraTokenMask,
  liaraContext,
  setLiaraToken,
  SettingsValidationError,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

type LiaraStatus = {
  connected: boolean;
  tokenMask: string | null;
  account?: { name?: string; email?: string };
  checkedAt: string;
  error?: { kind: string; message: string };
};

const ERROR_MESSAGES: Record<string, string> = {
  auth: "The token is invalid or has expired.",
  rate_limited: "Liara rate limit reached. Try again shortly.",
  network: "Could not reach Liara.",
};
const UNKNOWN_ERROR_MESSAGE = "Unexpected error while contacting Liara.";

function errorKind(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error) {
    if (typeof error.kind === "string") return error.kind;
  }
  return "unknown";
}

function readAccount(me: unknown): LiaraStatus["account"] {
  if (typeof me !== "object" || me === null || !("user" in me)) return undefined;
  const user = me.user;
  if (typeof user !== "object" || user === null) return undefined;
  const name = "fullname" in user && typeof user.fullname === "string" ? user.fullname : undefined;
  const email = "email" in user && typeof user.email === "string" ? user.email : undefined;
  if (!name && !email) return undefined;
  return { name, email };
}

async function buildStatus(): Promise<LiaraStatus> {
  const checkedAt = new Date().toISOString();
  const ctx = await liaraContext();
  if (!ctx) {
    return { connected: false, tokenMask: null, checkedAt };
  }
  const tokenMask = await getLiaraTokenMask();
  try {
    const me = await createLiaraClient(ctx.token, { teamId: ctx.teamId ?? undefined }).me();
    return {
      connected: true,
      tokenMask,
      account: readAccount(me),
      checkedAt,
    };
  } catch (error) {
    const kind = errorKind(error);
    return {
      connected: false,
      tokenMask,
      checkedAt,
      error: {
        kind,
        message: ERROR_MESSAGES[kind] ?? UNKNOWN_ERROR_MESSAGE,
      },
    };
  }
}

function errorResponse(error: unknown) {
  if (error instanceof SettingsValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("settings/liara failed:", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await buildStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const token =
      typeof body === "object" && body !== null && "token" in body ? body.token : undefined;
    if (typeof token !== "string") {
      return NextResponse.json({ error: "token must be a string." }, { status: 400 });
    }
    await setLiaraToken(token);
    return NextResponse.json(await buildStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await clearLiaraToken();
    return NextResponse.json(await buildStatus());
  } catch (error) {
    return errorResponse(error);
  }
}
