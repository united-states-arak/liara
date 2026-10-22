import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { DEFAULT_AGENT_MODE, isAgentMode } from "@/lib/agent/config";
import { resolveChatModel } from "@/lib/agent/model";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import { parseScope, scopePrompt, stampScope, type ResourceRef } from "@/lib/agent/scope";
import { latestStoredScope, verifyScope } from "@/lib/agent/scope-server";
import { saveConversation, startTurn } from "@/lib/agent/threads-store";
import { buildAgentTools } from "@/lib/agent/tools";
import { describeLiaraError } from "@/lib/liara/resources";
import { liaraContext } from "@/lib/settings";

export const maxDuration = 60;

type ChatRequestBody = {
  id?: unknown;
  messages?: unknown;
  mode?: unknown;
  resources?: unknown;
};

type ScopeResolution =
  | { ok: true; scope: ResourceRef[] }
  | { ok: false; status: number; error: string };

async function resolveRequestScope(
  requested: unknown,
  threadId: string | undefined,
): Promise<ScopeResolution> {
  if (requested === undefined) {
    return { ok: true, scope: threadId ? await latestStoredScope(threadId) : [] };
  }
  const refs = parseScope(requested);
  if (!refs) {
    return { ok: false, status: 400, error: "Invalid resources in the request." };
  }
  if (refs.length === 0) return { ok: true, scope: [] };

  const ctx = await liaraContext();
  if (!ctx) {
    return {
      ok: false,
      status: 400,
      error: "Liara token not configured. Open Settings to add it.",
    };
  }
  try {
    const verified = await verifyScope(ctx.token, refs, ctx.teamId ?? undefined);
    if (!verified.ok) return { ok: false, status: 400, error: verified.error };
    return { ok: true, scope: verified.scope };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `Could not check the attached resources. ${describeLiaraError(error).message}`,
    };
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ error: "Expected a messages array." }, { status: 400 });
  }
  const mode = isAgentMode(body.mode) ? body.mode : DEFAULT_AGENT_MODE;
  const threadId = typeof body.id === "string" && body.id.length > 0 ? body.id : undefined;

  const resolved = await resolveChatModel();
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }

  const scope = await resolveRequestScope(body.resources, threadId);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status });
  }

  const messages = stampScope(body.messages as UIMessage[], scope.scope);
  if (threadId) await startTurn(threadId, messages);

  const { tools, toolApproval } = buildAgentTools(mode, scope.scope);
  const result = streamText({
    abortSignal: req.signal,
    model: resolved.model,
    system: `${buildSystemPrompt(mode)}\n\n${scopePrompt(scope.scope)}`,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    toolApproval,
    stopWhen: stepCountIs(10),
    providerOptions: {
      openai: {
        reasoningEffort: "low",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? { usage: part.totalUsage, model: resolved.model.modelId }
        : undefined,
    sendReasoning: true,
    onError: (error) => (error instanceof Error ? error.message : String(error)),
    onEnd: async ({ messages: conversation }) => {
      if (!threadId) return;
      try {
        await saveConversation(threadId, conversation);
      } catch (error) {
        console.error("Failed to save chat thread", error);
      }
    },
  });
}
