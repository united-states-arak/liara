"use client";

import { defineToolkit } from "@assistant-ui/react";
import { AccountPlansToolUI } from "./tool-ui/account";
import { ArchitectureDiagramToolUI } from "./tool-ui/architecture";
import { AskUserToolUI } from "./tool-ui/ask-user";
import { WriteActionToolUI } from "./tool-ui/approval";
import { ProjectCardsToolUI, ProjectDetailToolUI } from "./tool-ui/apps";
import { ReadDocToolUI, SearchDocsToolUI } from "./tool-ui/docs";
import {
  FindingDetailToolUI,
  FindingsToolUI,
  FixPromptToolUI,
  HealthCheckToolUI,
} from "./tool-ui/findings";
import { DeployPromptToolUI } from "./tool-ui/deploy-prompt";
import { ApiBatchToolUI, ApiGetToolUI, ApiSearchToolUI, WaitForLiaraToolUI, WaitForReleaseToolUI } from "./tool-ui/api";
import { InspectRepoToolUI, ReadRepoFileToolUI } from "./tool-ui/repo";
import { DomainsToolUI } from "./tool-ui/domains";
import { LogsViewerToolUI } from "./tool-ui/logs";
import { MetricsCardToolUI } from "./tool-ui/metrics";
import { DeploymentStateToolUI } from "./tool-ui/releases";
import { withToolFailure } from "./tool-ui/shared";

/**
 * Render-only entries: the server defines each tool's schema and runs it, and
 * these only draw the result (or, for ask_user, collect the answer). Each
 * render is wrapped so a thrown tool error shows a friendly failure card.
 */
export const agentToolkit = defineToolkit({
  list_projects: { type: "backend", render: withToolFailure(ProjectCardsToolUI) },
  get_project: { type: "backend", render: withToolFailure(ProjectDetailToolUI) },
  get_logs: { type: "backend", render: withToolFailure(LogsViewerToolUI) },
  get_build_logs: { type: "backend", render: withToolFailure(LogsViewerToolUI) },
  wait_for_release: { type: "backend", render: withToolFailure(WaitForReleaseToolUI) },
  get_metrics: { type: "backend", render: withToolFailure(MetricsCardToolUI) },
  list_releases: { type: "backend", render: withToolFailure(DeploymentStateToolUI) },
  get_account_plans: { type: "backend", render: withToolFailure(AccountPlansToolUI) },
  search_liara_docs: { type: "backend", render: withToolFailure(SearchDocsToolUI) },
  read_liara_doc: { type: "backend", render: withToolFailure(ReadDocToolUI) },
  list_findings: { type: "backend", render: withToolFailure(FindingsToolUI) },
  get_finding: { type: "backend", render: withToolFailure(FindingDetailToolUI) },
  run_health_check: { type: "backend", render: withToolFailure(HealthCheckToolUI) },
  generate_fix_prompt: { type: "backend", render: withToolFailure(FixPromptToolUI) },
  restart_project: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  set_project_scale: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  resize_project: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  update_env_vars: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  create_database: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  create_project: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  deploy_project: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  add_domain: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  enable_ssl: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  list_domains: { type: "backend", render: withToolFailure(DomainsToolUI) },
  generate_deploy_prompt: { type: "backend", render: withToolFailure(DeployPromptToolUI) },
  liara_api_search: { type: "backend", render: withToolFailure(ApiSearchToolUI) },
  liara_api_get: { type: "backend", render: withToolFailure(ApiGetToolUI) },
  wait_for_liara: { type: "backend", render: withToolFailure(WaitForLiaraToolUI) },
  liara_api_write: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  deploy_image: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  inspect_repo: { type: "backend", render: withToolFailure(InspectRepoToolUI) },
  read_repo_file: { type: "backend", render: withToolFailure(ReadRepoFileToolUI) },
  liara_api_batch_get: { type: "backend", render: withToolFailure(ApiBatchToolUI) },
  liara_api_batch_write: { type: "backend", render: withToolFailure(WriteActionToolUI) },
  ask_user: { type: "backend", render: withToolFailure(AskUserToolUI) },
  propose_architecture: { type: "backend", render: withToolFailure(ArchitectureDiagramToolUI) },
});
