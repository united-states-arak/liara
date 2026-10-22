"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LIARA_STATUS_KEY,
  requestJson,
  type LiaraStatus,
} from "@/components/settings/settings-api";
import { Notice, StatusBadge, type NoticeState } from "@/components/settings/ui";

const LIARA_ENDPOINT = "/api/settings/liara";

function badgeFor(status: LiaraStatus | undefined) {
  if (!status) {
    return { label: "Checking…", tone: "neutral" as const };
  }
  if (status.connected) {
    return { label: "Connected", tone: "success" as const };
  }
  switch (status.error?.kind) {
    case undefined:
      return { label: "Not connected", tone: "neutral" as const };
    case "auth":
      return { label: "Token invalid or expired", tone: "error" as const };
    case "rate_limited":
      return { label: "Rate limited", tone: "warning" as const };
    case "network":
      return { label: "Network error", tone: "error" as const };
    default:
      return { label: "Error", tone: "error" as const };
  }
}

export function LiaraSection() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const status = useQuery({
    queryKey: LIARA_STATUS_KEY,
    queryFn: () => requestJson<LiaraStatus>(LIARA_ENDPOINT),
  });

  const save = useMutation({
    mutationFn: (value: string) =>
      requestJson<LiaraStatus>(LIARA_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ token: value }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(LIARA_STATUS_KEY, data);
      setToken("");
      setNotice(
        data.connected
          ? { tone: "success", text: "Token saved and verified." }
          : { tone: "error", text: "Token saved, but verification failed." },
      );
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const disconnect = useMutation({
    mutationFn: () => requestJson<LiaraStatus>(LIARA_ENDPOINT, { method: "DELETE" }),
    onSuccess: (data) => {
      queryClient.setQueryData(LIARA_STATUS_KEY, data);
      setNotice({ tone: "success", text: "Stored token removed." });
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const data = status.data;
  const badge = status.isError ? { label: "Unavailable", tone: "error" as const } : badgeFor(data);
  const busy = save.isPending || disconnect.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = token.trim();
    if (!value || busy) return;
    setNotice(null);
    save.mutate(value);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Liara account</h3>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </div>

      {data?.tokenMask ? (
        <p className="text-sm text-muted-foreground">
          Token <code className="font-mono text-foreground">{data.tokenMask}</code>
          {data.account?.name || data.account?.email ? (
            <>
              {" · "}
              {[data.account.name, data.account.email].filter(Boolean).join(" · ")}
            </>
          ) : null}
        </p>
      ) : null}

      {status.isError ? <p className="text-sm text-destructive">{status.error.message}</p> : null}
      {data?.error ? <p className="text-sm text-destructive">{data.error.message}</p> : null}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="liara-token" className="text-sm font-medium">
          API token
        </label>
        <div className="flex gap-2">
          <Input
            id="liara-token"
            name="liara-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={data?.tokenMask ? "Enter a new token to replace" : "Paste your token"}
            disabled={busy}
          />
          <Button type="submit" disabled={!token.trim() || busy}>
            {save.isPending ? "Verifying…" : "Save & verify"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create a token in the Liara console (API section). It is encrypted and stored on this
          server only.
        </p>
      </form>

      <div className="flex min-h-8 items-center justify-between gap-2">
        <Notice notice={notice} />
        {data?.tokenMask ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => disconnect.mutate()}
            disabled={busy}
            className="ml-auto"
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
