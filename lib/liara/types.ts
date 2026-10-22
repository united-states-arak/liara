// Shapes follow app/data/liara-api/paas.yaml. Fields the spec does not
// declare, or declares without a type we can rely on, are optional.

export interface LiaraEnvVariable {
  key: string;
  value: string;
  encrypted?: boolean;
  _id?: string;
}

export interface LiaraProjectSummary {
  _id?: string;
  project_id: string;
  type?: string;
  status?: string;
  scale?: number;
  planID?: string;
  created_at?: string;
  isDeployed?: boolean;
}

export interface LiaraProjectsResponse {
  projects: LiaraProjectSummary[];
}

export interface LiaraProjectDetails {
  _id?: string;
  project_id: string;
  type?: string;
  status?: string;
  defaultSubdomain?: boolean;
  readOnlyRootFilesystem?: boolean;
  zeroDowntime?: boolean;
  scale?: number;
  envs?: LiaraEnvVariable[];
  planID?: string;
  fixedIPStatus?: string;
  created_at?: string;
  node?: {
    _id?: string;
    IP?: string;
  };
  hourlyPrice?: number;
  isDeployed?: boolean;
  reservedDiskSpace?: number;
}

export interface LiaraProjectAllDetailsResponse {
  project: LiaraProjectDetails;
}

// Spec: Logs is an array of { type, datetime, message }. Note: the Liara CLI
// reads a different v2 shape ({ data: [{ metaData, values }] }); see client.ts.
export interface LiaraLogLine {
  type?: string;
  datetime?: string;
  message?: string;
}

export type LiaraLogsResponse = LiaraLogLine[];

export interface LiaraEventsResponse {
  data: Array<{
    metaData?: Record<string, unknown>;
    values?: string[][];
  }>;
}

export interface LiaraRelease {
  _id?: string;
  type?: string;
  imageName?: string;
  projectType?: string;
  // Spec gives no enum for state. Do not assume values; see checker/rules.ts.
  state?: string;
  port?: number;
  gitInfo?: {
    branch?: string | null;
    message?: string | null;
    commit?: string | null;
    committedAt?: string | null;
    remote?: string | null;
    author?: {
      email?: string | null;
      name?: string | null;
    };
    tags?: string[];
  };
  client?: string;
  finishedAt?: string;
  createdAt?: string;
  tag?: string;
  sourceAvailable?: boolean;
}

export interface LiaraReleasesResponse {
  total?: number;
  currentRelease?: string;
  readyReleasesCount?: number;
  releases: LiaraRelease[];
  platform?: string;
}

// Spec: each value is an array of (number | string). Raw, not interpreted.
export type LiaraMetricValue = Array<number | string>;

export interface LiaraSummaryMetricsResponse {
  cpuUsage?: Array<{ value: LiaraMetricValue; applet?: string }>;
  memoryUsage?: Array<{ value: LiaraMetricValue; applet?: string }>;
  disksUsage?: Array<{
    size?: string;
    usage?: string;
    reportedAt?: string;
    name?: string;
  }>;
}

export interface LiaraReportsResponse {
  end?: number;
  result: Array<{
    values?: LiaraMetricValue[];
    applet?: string;
  }>;
}

// Not in the OpenAPI spec. Shape taken from the Liara docs (references/api/get-info)
// and the public CLI. Only the fields this app uses are typed.
export interface LiaraMeResponse {
  user?: {
    fullname?: string;
    email?: string;
    isTeam?: boolean;
    accountType?: string;
    remainingFreeCredit?: number;
    currentSubscriptionPlan?: {
      subscriptionPlanID?: string;
      subscriptionPlanExpiration?: string;
    };
  };
  plans?: {
    projects?: Record<string, { available?: boolean; [key: string]: unknown }>;
    projectBundlePlans?: Record<
      string,
      Record<string, { maxLogsRetention?: number; [key: string]: unknown }>
    >;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface LiaraUpdateEnvsResponse {
  message?: string;
}

// GET v2/teams. Not in the OpenAPI spec. Shape taken from the public CLI
// (lib/types/get-teams.d.ts and lib/types/team.d.ts in @liara/cli 9.6.0).
export interface LiaraTeamsPageResponse {
  totalTeams: number;
  teams: Array<{ _id: string; name: string }>;
}

export interface LiaraTeam {
  id: string;
  name: string;
}

export interface LiaraCreateAppInput {
  name: string;
  planID: string;
  platform?: string;
  readOnlyRootFilesystem?: boolean;
  /** Feature bundle plan id and network id: required by the API (CLI source: commands/app/create.js). */
  bundlePlanID?: string;
  network?: string;
}

export interface LiaraNetwork {
  _id: string;
  name: string;
  createdAt?: string;
}

export interface LiaraCreateDatabaseInput {
  hostname: string;
  type: string;
  version: string;
  planID: string;
  bundlePlanID?: string;
  publicNetwork: boolean;
  network: string;
}

export interface LiaraDeployReleaseInput {
  sourceID?: string;
  port: number;
  type: string;
  /** Docker image (CLI-derived field, see lib/agent/tools.ts deploy_image). */
  image?: string;
  envs?: Array<{ key: string; value: string }>;
  disks?: Array<{ name: string; mountTo: string }>;
  args?: string[];
}

export interface LiaraDeployReleaseResponse {
  releaseID?: string;
}

export interface LiaraDeploySourceResponse {
  sourceID?: string;
}

export interface LiaraDomain {
  _id?: string;
  name?: string;
  type?: string;
  status?: string;
  certificatesStatus?: string;
  redirectTo?: string;
  redirectStatus?: number;
  created_at?: string;
  CNameRecord?: string;
  project?: {
    _id?: string;
    project_id?: string;
  };
}

export interface LiaraDomainsResponse {
  domains: LiaraDomain[];
}

export interface LiaraCreateDomainResponse {
  domain?: { _id?: string };
}

/** CLI source (services/build-logs.js). States seen there: BUILDING, PUSHING, DEPLOYING, READY, FAILED, UNHEALTHY, CANCELED, TIMEDOUT. */
export interface LiaraReleaseDetail {
  _id?: string;
  state?: string;
  failReason?: string;
  queue?: number;
  tag?: string;
}

export interface LiaraBuildLogsResponse {
  release?: LiaraReleaseDetail;
  buildOutput?: Array<{ stream?: string; line?: string; createdAt?: string }>;
}
