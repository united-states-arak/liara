export const AGENT_MODES = ["setup", "manage", "monitor"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export const DEFAULT_AGENT_MODE: AgentMode = "setup";

export const AGENT_MODE_META: Record<AgentMode, { label: string; description: string }> = {
  setup: {
    label: "Setup",
    description: "Set up a new site: choose a plan, deploy, connect a domain and set variables.",
  },
  manage: {
    label: "Manage",
    description:
      "Change an existing app: restart, stop or start, change plan, set variables. Each change needs your approval.",
  },
  monitor: {
    label: "Monitor",
    description:
      "Check an app's health: logs, CPU and memory, releases, events and findings. Read only.",
  },
};

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value);
}

export const WRITE_TOOL_NAMES = [
  "restart_project",
  "set_project_scale",
  "resize_project",
  "update_env_vars",
  "create_project",
  "create_database",
  "deploy_project",
  "add_domain",
  "enable_ssl",
  "deploy_image",
  "liara_api_write",
  "liara_api_batch_write",
] as const;

const READ_TOOL_NAMES = [
  "list_projects",
  "get_project",
  "get_logs",
  "get_build_logs",
  "wait_for_release",
  "get_metrics",
  "list_releases",
  "get_events",
  "get_account_plans",
  "list_domains",
  "search_liara_docs",
  "read_liara_doc",
  "list_findings",
  "get_finding",
  "run_health_check",
  "generate_fix_prompt",
] as const;

export const MODE_TOOL_NAMES: Record<AgentMode, readonly string[]> = {
  setup: [
    "list_projects",
    "get_project",
    "get_logs",
    "get_build_logs",
    "wait_for_release",
    "list_releases",
    "get_events",
    "get_account_plans",
    "search_liara_docs",
    "read_liara_doc",
    "ask_user",
    "propose_architecture",
    "list_domains",
    "create_project",
    "create_database",
    "deploy_project",
    "add_domain",
    "enable_ssl",
    "generate_deploy_prompt",
    "liara_api_search",
    "liara_api_get",
    "liara_api_batch_get",
    "inspect_repo",
    "read_repo_file",
    "wait_for_liara",
    "liara_api_write",
    "liara_api_batch_write",
    "deploy_image",
    "update_env_vars",
  ],
  manage: [
    ...READ_TOOL_NAMES.filter(
      (name) =>
        !["list_findings", "get_finding", "run_health_check", "generate_fix_prompt"].includes(name),
    ),
    "ask_user",
    "generate_deploy_prompt",
    "liara_api_search",
    "liara_api_get",
    "liara_api_batch_get",
    "inspect_repo",
    "read_repo_file",
    "wait_for_liara",
    ...WRITE_TOOL_NAMES,
  ],
  monitor: [
    "list_projects",
    "get_project",
    "get_logs",
    "get_build_logs",
    "get_metrics",
    "list_releases",
    "get_events",
    "search_liara_docs",
    "read_liara_doc",
    "list_findings",
    "get_finding",
    "run_health_check",
    "generate_fix_prompt",
    "liara_api_search",
    "liara_api_get",
    "liara_api_batch_get",
    "ask_user",
  ],
};
