"use client";

import { useState } from "react";
import type { ToolApprovalResponse, ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Check, ShieldQuestion, X } from "lucide-react";
import { isToolError, type WriteResult } from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";
import { Pill, ToolCard, ToolError, ToolRunning } from "./shared";

type WriteArgs = {
  name?: string;
  scale?: number;
  planID?: string;
  variables?: Array<{ key?: string }>;
  platform?: string;
  port?: number;
  sourceUrl?: string;
  branch?: string;
  domain?: string;
  service?: string;
  method?: string;
  path?: string;
  reason?: string;
  body?: Record<string, unknown>;
  image?: string;
  hostname?: string;
  type?: string;
  calls?: Array<{ method?: string; path?: string }>;
};

const SECRET_KEY = /pass|secret|token|key|credential/i;

function bodyPreview(body: Record<string, unknown> | undefined): string {
  if (!body) return "none";
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, SECRET_KEY.test(key) ? "hidden" : value]),
    ),
  ).slice(0, 400);
}

type Param = { label: string; value: string };

function parameters(toolName: string, args: WriteArgs): Param[] {
  if (toolName === "set_project_scale") {
    return [{ label: "Scale", value: args.scale === undefined ? "…" : String(args.scale) }];
  }
  if (toolName === "resize_project") {
    return [{ label: "Plan", value: args.planID ?? "…" }];
  }
  if (toolName === "liara_api_write") {
    return [
      { label: "Request", value: `${args.method ?? "…"} ${args.service ?? "…"} ${args.path ?? "…"}` },
      { label: "Body", value: bodyPreview(args.body) },
    ];
  }
  if (toolName === "create_database") {
    return [
      { label: "Engine", value: args.type ?? "…" },
      { label: "Version and plan", value: "chosen automatically" },
    ];
  }
  if (toolName === "liara_api_batch_write") {
    return (args.calls ?? []).map((call, index) => ({
      label: `Step ${index + 1}`,
      value: `${call.method ?? "…"} ${call.path ?? "…"}`,
    }));
  }
  if (toolName === "deploy_image") {
    return [
      { label: "Image", value: args.image ?? "…" },
      { label: "Port", value: String(args.port ?? "…") },
      { label: "Env values", value: "hidden" },
    ];
  }
  if (toolName === "create_project") {
    return [
      { label: "Plan", value: args.planID ?? "chosen automatically" },
      { label: "Platform", value: args.platform ?? "…" },
    ];
  }
  if (toolName === "deploy_project") {
    return [
      { label: "Source", value: args.sourceUrl ?? "…" },
      { label: "Platform", value: args.platform ?? "…" },
      { label: "Port", value: String(args.port ?? "…") },
    ];
  }
  if (toolName === "add_domain" || toolName === "enable_ssl") {
    return [{ label: "Domain", value: args.domain ?? "…" }];
  }
  if (toolName === "update_env_vars") {
    const keys = (args.variables ?? []).map((variable) => variable.key ?? "…");
    return [
      { label: "Variables", value: keys.length > 0 ? keys.join(", ") : "…" },
      { label: "Values", value: "hidden" },
    ];
  }
  return [];
}

function describe(toolName: string, args: WriteArgs): string {
  const name = args.name ?? "…";
  switch (toolName) {
    case "restart_project":
      return `Restart app '${name}'.`;
    case "set_project_scale":
      if (args.scale === 0) return `Stop app '${name}' (scale → 0).`;
      if (args.scale === 1) return `Start app '${name}' (scale → 1).`;
      return `Change the scale of app '${name}'.`;
    case "resize_project":
      return `Change the plan of app '${name}' to ${args.planID ?? "…"}.`;
    case "liara_api_batch_write":
      return args.reason ?? `Run ${args.calls?.length ?? 0} changes on Liara, in order.`;
    case "liara_api_write":
      return args.reason ?? `Send ${args.method ?? "…"} ${args.path ?? "…"} to the Liara API.`;
    case "deploy_image":
      return `Deploy Docker image ${args.image ?? "…"} to app '${name}'. The running version is replaced.`;
    case "create_database":
      return `Create a ${args.type ?? "…"} database '${args.hostname ?? "…"}'. A paid database starts billing.`;
    case "create_project":
      return `Create a new app '${name}'. A paid plan may start billing.`;
    case "deploy_project":
      return `Download the code from the source link and deploy it to app '${name}'. The running version is replaced.`;
    case "add_domain":
      return `Add domain ${args.domain ?? "…"} to app '${name}'.`;
    case "enable_ssl":
      return `Request a free SSL certificate for ${args.domain ?? "…"}.`;
    case "update_env_vars": {
      const count = args.variables?.length ?? 0;
      return `Set ${count} environment variable${count === 1 ? "" : "s"} on app '${name}'. Existing variables are kept; listed keys are added or overwritten.`;
    }
    default:
      return `Run ${toolName} on '${name}'.`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not record the decision.";
}

export const WriteActionToolUI: ToolCallMessagePartComponent<WriteArgs, WriteResult> = ({
  toolName,
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const answer = async (response: ToolApprovalResponse) => {
    setError(null);
    setPending(true);
    try {
      await respondToApproval(response);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  };

  const awaitingDecision =
    approval !== undefined && approval.approved === undefined && approval.resolution === undefined;
  const params = parameters(toolName, args);
  const sentence = describe(toolName, args);

  let badge: { tone: "neutral" | "warning" | "success" | "danger"; label: string };
  if (approval?.resolution) {
    badge = {
      tone: "neutral",
      label: approval.resolution === "cancelled" ? "Cancelled" : "Expired",
    };
  } else if (awaitingDecision) {
    badge = { tone: "warning", label: "Needs approval" };
  } else if (approval?.approved === false) {
    badge = { tone: "danger", label: "Denied" };
  } else if (result !== undefined && !isToolError(result)) {
    badge = { tone: "success", label: "Done" };
  } else if (isToolError(result)) {
    badge = { tone: "danger", label: "Failed" };
  } else {
    badge = { tone: "neutral", label: approval?.approved ? "Approved" : "Pending" };
  }

  return (
    <ToolCard
      slot="agent-write-action"
      title="Action"
      subtitle={toolName}
      icon={ShieldQuestion}
      action={<Pill tone={badge.tone}>{badge.label}</Pill>}
    >
      <p className="text-sm">{sentence}</p>
      {params.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {params.map((param) => (
            <div key={param.label} className="contents">
              <dt className="text-muted-foreground">{param.label}</dt>
              <dd className="min-w-0 break-words font-mono">{param.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {awaitingDecision ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void answer({ approved: true })}
              className={cn(
                "bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50",
              )}
            >
              <Check className="size-3.5" aria-hidden />
              Allow
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void answer({ approved: false, reason: "user denied" })}
              className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <X className="size-3.5" aria-hidden />
              Deny
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {approval?.approved === false ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Denied{approval.reason ? `: ${approval.reason}` : ""}. Nothing was changed.
        </p>
      ) : null}

      {approval?.approved === true && result === undefined ? (
        <ToolRunning label="Approved, running…" />
      ) : null}

      {result !== undefined && isToolError(result) ? <ToolError message={result.error} result={result} /> : null}
      {result !== undefined && !isToolError(result) ? (
        <p className="text-foreground mt-2 text-xs" role="status">
          {result.summary}
        </p>
      ) : null}
      {approval === undefined && result === undefined && status.type === "running" ? (
        <ToolRunning label="Running…" />
      ) : null}
    </ToolCard>
  );
};
