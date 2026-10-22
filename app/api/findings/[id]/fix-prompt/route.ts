import { getFinding } from "@/lib/checker/queries";
import { buildFixPrompt } from "@/lib/fix-prompt";
import { searchLiaraDocs } from "@/lib/docs/search";

export const dynamic = "force-dynamic";

type FixPromptTarget = "claude-code" | "cursor" | "codex" | "generic";

const TARGETS: readonly FixPromptTarget[] = ["claude-code", "cursor", "codex", "generic"];
const MAX_EXTRA_CONTEXT_CHARS = 2000;
const MAX_QUERY_CHARS = 500;

type ParsedBody =
  | { ok: true; target?: FixPromptTarget; extraContext?: string }
  | { ok: false; error: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const finding = await getFinding(id);
  if (!finding) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }

  const raw = await request.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
    }
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const query = [finding.title, finding.summary, parsed.extraContext]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_QUERY_CHARS);

  let docs: Awaited<ReturnType<typeof searchLiaraDocs>> = [];
  try {
    docs = await searchLiaraDocs({ query, limit: 5 });
  } catch (error) {
    console.error(
      "[fix-prompt] docs search failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const built = buildFixPrompt({
    finding,
    docs,
    target: parsed.target,
    extraContext: parsed.extraContext,
  });
  return Response.json({
    prompt: built.prompt,
    docs,
    warnings: built.warnings,
  });
}

function parseBody(body: unknown): ParsedBody & { extraContext?: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const { target, extraContext } = body as Record<string, unknown>;

  if (target !== undefined && !TARGETS.includes(target as FixPromptTarget)) {
    return {
      ok: false,
      error: `target must be one of: ${TARGETS.join(", ")}`,
    };
  }

  if (extraContext !== undefined && typeof extraContext !== "string") {
    return { ok: false, error: "extraContext must be a string" };
  }
  const trimmed = typeof extraContext === "string" ? extraContext.trim() : "";
  if (trimmed.length > MAX_EXTRA_CONTEXT_CHARS) {
    return {
      ok: false,
      error: `extraContext must be at most ${MAX_EXTRA_CONTEXT_CHARS} characters`,
    };
  }

  return {
    ok: true,
    target: target as FixPromptTarget | undefined,
    extraContext: trimmed || undefined,
  };
}
