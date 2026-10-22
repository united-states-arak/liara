"use client";

import Link from "next/link";
import { Activity, Download } from "lucide-react";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { Thread, type ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/elements/threadlist-sidebar.aui";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { AssistantTeamSelector } from "@/components/team/assistant-team-selector";
import { AgentConfigBanner } from "@/components/agent/config-banner";
import { HistoryErrorBanner } from "@/components/agent/history-error-banner";
import { AgentModeSelector } from "@/components/agent/mode-selector";
import { MermaidBlock } from "@/components/agent/mermaid-diagram";
import { agentToolkit } from "@/components/agent/toolkit";
import { withToolFailure } from "@/components/agent/tool-ui/shared";
import { AgentWelcome } from "@/components/agent/welcome";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { useAgentModeStore } from "@/lib/agent/mode-store";
import { agentThreadListAdapter } from "@/lib/agent/thread-adapter";
import { AttachedResourceChips } from "@/components/agent/attachments/attached-chips";
import { ResourcePicker } from "@/components/agent/attachments/resource-picker";
import { requestResourceScope } from "@/components/agent/attachments/scope-store";

const agentTransport = new AssistantChatTransport({
  api: "/api/chat",
  body: () => ({
    mode: useAgentModeStore.getState().mode,
    resources: requestResourceScope(),
  }),
});

const sendAutomaticallyWhen = (options: { messages: UIMessage[] }) =>
  lastAssistantMessageIsCompleteWithToolCalls(options) ||
  lastAssistantMessageIsCompleteWithApprovalResponses(options);

const threadComponents: ThreadComponents = {
  Welcome: AgentWelcome,
  ComposerAccessory: AgentModeSelector,
  AttachmentPicker: ResourcePicker,
  AttachmentChips: AttachedResourceChips,
  ToolFallback: withToolFailure(ToolFallback),
  markdownComponentsByLanguage: {
    mermaid: { SyntaxHighlighter: MermaidBlock },
  },
};

export const Assistant = () => {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => useChatRuntime({ transport: agentTransport, sendAutomaticallyWhen }),
    adapter: agentThreadListAdapter,
  });
  const config = AuiConfig({ tools: Tools({ toolkit: agentToolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pe-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="me-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <span className="text-muted-foreground">Liara</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Assistant</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <AssistantTeamSelector />
              <div className="ms-auto flex items-center gap-1">
                <a
                  href="/api/skill"
                  download
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <Download className="size-4" aria-hidden />
                  Liara skill
                </a>
                <Link href="/monitor" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  <Activity className="size-4" aria-hidden />
                  Monitor
                </Link>
                <ThemeToggle />
                <SettingsDialog />
              </div>
            </header>
            <AgentConfigBanner />
            <HistoryErrorBanner />
            <div className="flex-1 overflow-hidden">
              <Thread components={threadComponents} />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
