"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AI_CONFIG_KEY,
  requestJson,
  type AiConfig,
  type AiTestResult,
} from "@/components/settings/settings-api";
import { Notice, type NoticeState } from "@/components/settings/ui";

const AI_ENDPOINT = "/api/settings/ai";

export function AiSection() {
  const config = useQuery({
    queryKey: AI_CONFIG_KEY,
    queryFn: () => requestJson<AiConfig>(AI_ENDPOINT),
  });

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">AI provider</h3>
      {config.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {config.isError ? <p className="text-sm text-destructive">{config.error.message}</p> : null}
      {config.data ? <AiForm config={config.data} /> : null}
    </section>
  );
}

function AiForm({ config }: { config: AiConfig }) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);

  const save = useMutation({
    mutationFn: () =>
      requestJson<AiConfig>(AI_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ baseUrl, model, apiKey }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AI_CONFIG_KEY, data);
      setBaseUrl(data.baseUrl);
      setModel(data.model);
      setApiKey("");
      setTestResult(null);
      setNotice({ tone: "success", text: "AI settings saved." });
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const removeKey = useMutation({
    mutationFn: () =>
      requestJson<AiConfig>(AI_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ apiKey: "clear" }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(AI_CONFIG_KEY, data);
      setApiKey("");
      setTestResult(null);
      setNotice({ tone: "success", text: "API key removed." });
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const test = useMutation({
    mutationFn: () =>
      requestJson<AiTestResult>("/api/settings/ai/test", {
        method: "POST",
        body: JSON.stringify({ baseUrl, apiKey }),
      }),
    onMutate: () => setTestResult(null),
    onSuccess: (data) => setTestResult(data),
    onError: (error: Error) => setTestResult({ ok: false, status: null, message: error.message }),
  });

  const busy = save.isPending || removeKey.isPending || test.isPending;
  const canSubmit = baseUrl.trim() !== "" && model.trim() !== "" && !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setNotice(null);
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="ai-base-url" className="text-sm font-medium">
          Base URL
        </label>
        <Input
          id="ai-base-url"
          name="ai-base-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ai-model" className="text-sm font-medium">
          Model
        </label>
        <Input
          id="ai-model"
          name="ai-model"
          autoComplete="off"
          spellCheck={false}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ai-api-key" className="text-sm font-medium">
          API key
        </label>
        <Input
          id="ai-api-key"
          name="ai-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            config.hasApiKey ? "Leave blank to keep the saved key" : "Paste your API key"
          }
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          {config.hasApiKey ? `Key saved (${config.apiKeyMask ?? "hidden"})` : "No key saved."}
          {config.source === "env"
            ? " Values from environment variables apply until you save here."
            : ""}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        OpenAI-compatible endpoint. AvalAI is the default.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => test.mutate()}
          disabled={busy || baseUrl.trim() === ""}
        >
          {test.isPending ? "Testing…" : "Test connection"}
        </Button>
        {config.hasApiKey ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeKey.mutate()}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Remove key
          </Button>
        ) : null}
      </div>

      <div className="min-h-5 space-y-1">
        <Notice notice={notice} />
        {testResult ? (
          <p
            role="status"
            className={
              testResult.ok
                ? "text-sm text-emerald-700 dark:text-emerald-400"
                : "text-sm text-destructive"
            }
          >
            {testResult.message}
            {testResult.status !== null ? ` (HTTP ${testResult.status})` : ""}
          </p>
        ) : null}
      </div>
    </form>
  );
}
