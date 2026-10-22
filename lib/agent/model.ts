import { createOpenAI } from "@ai-sdk/openai";
import { getAiApiKey, getAiConfig } from "@/lib/settings";

export const AI_KEY_MISSING_MESSAGE = "AI API key not configured. Open Settings.";

export async function resolveChatModel(): Promise<
  | { ok: true; model: ReturnType<ReturnType<typeof createOpenAI>["responses"]> }
  | { ok: false; error: string }
> {
  const [config, apiKey] = await Promise.all([getAiConfig(), getAiApiKey()]);
  if (!apiKey) return { ok: false, error: AI_KEY_MISSING_MESSAGE };
  const provider = createOpenAI({ apiKey, baseURL: config.baseUrl });
  return { ok: true, model: provider.responses(config.model) };
}
