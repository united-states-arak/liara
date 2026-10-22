"use client";

import { useAui } from "@assistant-ui/react";
import { TeamSelector } from "./team-selector";

/** Team selector for the chat header. Starts a fresh thread after a team change so old tool results do not leak across teams. */
export function AssistantTeamSelector() {
  const aui = useAui();
  return <TeamSelector onChanged={() => void aui.threads.switchToNewThread()} />;
}
