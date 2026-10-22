import { NextResponse } from "next/server";
import { teamKeyOf } from "@/lib/liara/inventory";
import { isResourceKind } from "@/lib/liara/services";
import { tagResource, untagResource, type TagInput } from "@/lib/liara/tags";
import { getSelectedTeamId } from "@/lib/settings";

export const dynamic = "force-dynamic";

const NAME_MAX_LENGTH = 200;
const ID_MAX_LENGTH = 256;

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body) return badRequest("Request body must be a JSON object.");
    const input = parseTagInput(body);
    if (typeof input === "string") return badRequest(input);

    const teamKey = teamKeyOf(await getSelectedTeamId());
    return NextResponse.json(await tagResource(teamKey, input));
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body) return badRequest("Request body must be a JSON object.");
    const id = shortText(body.id, ID_MAX_LENGTH);
    if (!id) return badRequest("id is required.");

    const teamKey = teamKeyOf(await getSelectedTeamId());
    const removed = await untagResource(id, teamKey);
    if (!removed) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }
    return NextResponse.json({ removed: true });
  } catch {
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

function parseTagInput(body: Record<string, unknown>): TagInput | string {
  if (!isResourceKind(body.kind)) return "kind is not a supported resource kind.";
  const resourceId = shortText(body.resourceId, ID_MAX_LENGTH);
  if (!resourceId) return "resourceId is required.";
  const name = shortText(body.name, NAME_MAX_LENGTH);
  if (!name) return "name is required.";
  if (body.monitored !== undefined && typeof body.monitored !== "boolean") {
    return "monitored must be a boolean.";
  }
  return {
    kind: body.kind,
    resourceId,
    name,
    monitored: typeof body.monitored === "boolean" ? body.monitored : undefined,
  };
}

function shortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const value: unknown = await request.json().catch(() => null);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
