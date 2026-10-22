# StarCoach: Liara infrastructure agent

A chat assistant for website owners who are not developers. It helps set up, deploy, connect a domain to, and monitor apps on [Liara](https://liara.ir). It reads real data from the Liara API, answers from the official Liara documentation with source links, runs an hourly read-only health checker, and generates copy-paste fix prompts for coding agents.

## Quick start

```bash
cd app
npm install
cp .env.example .env.local   # optional; the UI can set all keys
npm run dev
```

Open http://localhost:3000.

1. Click **Settings** and paste your Liara API token. It is checked with `GET /v1/me` and stored encrypted (AES-256-GCM) in SQLite.
2. In the same dialog, check the AI provider. The default is AvalAI (`https://api.avalai.ir/v1`, model `gpt-6-luna`). Paste its API key.
3. Choose a mode in the composer: **Setup**, **Manage**, or **Monitor**.
4. Open **Monitor** (`/monitor`) for project health, findings, and check history. **Run check now** starts an on-demand check.

## What the assistant does

- **Setup**: recommends a plan from the plans on your account, shows the layout of multi-part setups, and walks you through creating the app, uploading code, and connecting a domain. It cannot create the app or add the domain itself yet (see Limitations).
- **Manage**: lists apps, reads status, releases, logs, and CPU/memory reports, and makes four kinds of change: restart, stop or start, change plan, and set environment variables.
- **Monitor**: read only. It collects logs, metrics, releases, and events for a problem, and suggests likely causes in order, with the evidence for each.

Every change needs your approval. The chat shows an approval card with the action, and nothing runs until you approve it. If you deny it, the card says nothing was changed. After an approved change, the assistant's instructions tell it to re-check the app with a read tool and report what it finds. That re-check is part of the prompt, not enforced by code.

Attachments: the **+** button in the composer attaches Liara resources to a conversation (`/api/resources`). Once any attachment is added, app tools and finding tools only reach the attached apps. Databases and buckets can be attached, but no tool acts on them.

Team accounts: the team selector (`components/team/team-selector.tsx`) switches between your personal account and a Liara team. The selected team is sent as `teamID` on every Liara API call.

Clarifying questions: the assistant can ask up to four questions in one card (`ask_user`), with options and free text.

Folders: conversations can be grouped into folders (`/api/folders`). This is only for organizing chats.

## Architecture

```
app/
  app/                 Next.js 16 routes (chat at /, dashboard at /monitor, API under app/api)
  app/api/chat         Streaming chat (AI SDK v7, OpenAI Responses API via AvalAI). Saves threads.
  app/api/threads      Thread list and history backed by SQLite
  app/api/folders      Conversation folders
  app/api/resources    Lists Liara resources that can be attached to a conversation
  app/api/resources/tags  Marks resources for monitoring (API only; no UI calls it yet)
  app/api/liara        Teams: list and select
  app/api/checks       Health overview, runs, manual run
  app/api/cron/check   Protected endpoint for external cron
  app/api/findings     Finding details and fix-prompt generation
  app/api/settings     Liara token and AI provider settings
  app/api/docs         Documentation search and page retrieval
  components/agent     Chat UI: mode selector, approval cards, ask-user, attachments, folders, service cards, logs, metrics, mermaid
  components/team      Team selector
  components/dashboard Monitor dashboard
  components/settings  Settings dialog
  db/                  Drizzle schema (SQLite via libsql) and migrations
  instrumentation.ts   Starts the hourly checker (unless SCHEDULER_ENABLED=false)
  lib/liara            Typed Liara API client, error kinds, resource inventory (services.ts), tags, inventory
  lib/checker          Targets, data loaders, deterministic rules, dedupe, runner, scheduler
  lib/agent            Modes, prompts, tools, tool result types, attachment scope, folders, model factory, thread store
  lib/docs             Local Liara documentation index and search
  lib/fix-prompt.ts    Copy-paste fix prompt generator
  lib/crypto.ts        AES-256-GCM for stored secrets
  lib/redact.ts        Secret redaction for logs, evidence, and prompts
  data/liara-docs      Liara documentation (markdown) used for retrieval
  data/liara-api       Liara OpenAPI specs (PaaS, DBaaS, Object Storage)
```

Stack: Next.js 16, React 19, assistant-ui (`@assistant-ui/react`, `@assistant-ui/ai-sdk`), AI SDK v7, Drizzle ORM with libsql (SQLite), TanStack Query, Tailwind v4, shadcn/ui.

### Modes

| Mode    | Purpose                                                                               | Changes to your Liara apps         |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Setup   | Recommend a plan, show the layout, guide deploy and domain steps                      | Resize and env vars, with approval |
| Manage  | List and inspect apps, releases, logs, metrics; restart, stop/start, resize, env vars | Four write tools, with approval    |
| Monitor | Logs, metrics, releases, events, findings, fix prompts; health check on demand        | None                               |

Monitor's **run check** writes check records and findings to the local database. It does not change Liara.

### Agent tools

Read: `list_projects`, `get_project`, `get_logs`, `get_metrics`, `list_releases`, `get_events`, `get_account_plans`, `search_liara_docs`, `read_liara_doc`.

Read, Monitor only: `list_findings`, `get_finding`, `run_health_check`, `generate_fix_prompt`.

Write (approval card required before execution): `restart_project`, `set_project_scale` (scale 0 stops the app, 1 starts it), `resize_project`, `update_env_vars`.

Interaction: `ask_user` (questions with options), `propose_architecture` (renders a diagram; changes nothing).

Tools per mode are listed in `lib/agent/config.ts` (`MODE_TOOL_NAMES`). The write tools are listed in `WRITE_TOOL_NAMES`, and each one gets the approval requirement in `lib/agent/tools.ts` (`buildAgentTools`).

Secrets: the model never receives the Liara token or env values. `get_project` returns env var keys only. `update_env_vars` reads current values internally to merge them and never returns them. Logs and evidence pass through `lib/redact.ts`.

## Liara API connection

- Base URL: `https://api.liara.ir` for apps, databases, and the account. Auth: `Authorization: Bearer <token>`. Requests time out after 15 s.
- Token entry: Settings dialog. It is checked with `GET /v1/me` and stored encrypted in SQLite. It is never returned to the browser or logged.
- Team mode: the selected team ID is sent as the `teamID` query parameter on each request. Teams are listed with `GET /v2/teams`.
- App read endpoints (`lib/liara/client.ts`), spec in `app/data/liara-api/paas.yaml`:
  - `GET /v1/me`: account and plans (`plans` field). Documented in the live spec at `developers.liara.ir/spec/me.yaml`, not in the local copy.
  - `GET /v1/projects`, `GET /v1/projects/{name}`
  - `GET /v1/projects/{name}/logs?since=` (Unix seconds)
  - `GET /v1/projects/{name}/events`
  - `GET /v1/projects/{name}/releases?page=&count=`
  - `GET /v1/projects/{name}/metrics/summary`, `/metrics/cpu?since=`, `/metrics/memory?since=`
- App write endpoints (approval required in chat):
  - `POST /v1/projects/{name}/actions/restart`
  - `POST /v1/projects/{name}/actions/scale` with `{ scale: 0 | 1 }`
  - `POST /v1/projects/{name}/resize` with `{ planID }`
  - `POST /v1/projects/update-envs` with `{ project, variables: [{ key, value }] }`
- `update_env_vars` reads the app's current variables first and sends the kept variables with the new ones. If a current value is not available, it refuses and asks you to change the variables in the Liara console.
- Other read-only endpoints, used by the inventory (`lib/liara/services.ts`) and the checker (`lib/checker/fetch.ts`):

  | Resource      | Host                       | Path                                                                            |
  | ------------- | -------------------------- | ------------------------------------------------------------------------------- |
  | Databases     | `api.liara.ir`             | `GET /v1/databases`, `/v1/databases/{id}`, `/v1/databases/{id}/metrics/summary` |
  | Buckets       | `storage-service.liara.ir` | `GET /api/v1/buckets`, `/api/v1/buckets/{id}/metrics/summary`                   |
  | VMs           | `iaas-api.liara.ir`        | `GET /vm`, `/vm/{id}`                                                           |
  | AI workspaces | `ai.liara.ir`              | `GET /v1/workspaces`, `/v1/workspaces/{id}`                                     |
  | Mail servers  | `mail-service.liara.ir`    | `GET /api/v1/mails` (inventory only)                                            |
  | DNS zones     | `dns-service.liara.ir`     | `GET /api/v1/zones` (inventory only)                                            |

- Documented in the Liara API but not used by any tool: creating an app (`POST /v1/projects`), deploying sources (`POST /v2/projects/{name}/sources`), deploying a release (`POST /v2/projects/{name}/releases`), domains and SSL (`/v1/domains…`), disks, DNS and mail management, and VMs and databases beyond the reads above.
- Errors are typed (`auth`, `rate_limited`, `not_found`, `server`, `network`, `unknown`). They appear as tool results or check status, not as silent failures. HTTP 429 uses `Retry-After` when present.

## Health checker

- Targets: the checker covers resources tagged for monitoring (`resource_tags`, marked `monitored`) for the selected team or the personal account, across all kinds. If nothing is tagged, it checks every app in the account.
- Kinds with a data loader: app, database, VM, AI workspace, bucket. Mail servers and DNS zones have no loader yet, so they are skipped.
- Runs every hour in the server process (`instrumentation.ts`, `lib/checker/scheduler.ts`) unless `SCHEDULER_ENABLED=false`.
- On serverless deployments, call `POST /api/cron/check` from an external scheduler with `Authorization: Bearer $CRON_SECRET`.
- Manual run: **Run check now** on `/monitor`, or the `run_health_check` tool. The tool is not available while apps are attached.
- Read only. The checker sends only GET requests.
- Rules (`lib/checker/rules.ts`) use only data the APIs return. No threshold is applied to metrics.

| Kind                  | Rule                                    | Severity                                                | What it reports                          | Runs                                                               |
| --------------------- | --------------------------------------- | ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| App                   | `app-not-deployed`                      | medium                                                  | Liara reports no active deployment       | Yes                                                                |
| App                   | `app-stopped`                           | low                                                     | Scale is 0                               | Yes                                                                |
| App                   | `app-log-errors`                        | medium, high for panic, fatal, out of memory, OOMKilled | Error patterns in recent logs            | Yes                                                                |
| App                   | `app-resource-usage`                    | info                                                    | Latest CPU and memory values as returned | Yes                                                                |
| App                   | `app-release-failed`                    | high                                                    | Latest release failed                    | No: release state values are not documented                        |
| Database              | `db-powered-off`                        | low                                                     | Database scale is 0                      | Yes                                                                |
| Database              | `db-resource-usage`                     | info                                                    | Latest usage values as returned          | Yes                                                                |
| Database              | `db-not-running`                        | high                                                    | Not running                              | No: the status field is untyped and no running state is documented |
| Database              | `db-error-events`                       | high                                                    | Error events                             | No: events have no documented error field                          |
| VM                    | `vm-powered-off`                        | low                                                     | Power state is `POWERED_OFF`             | Yes                                                                |
| AI workspace          | `ai-workspace-frozen`                   | medium                                                  | State is `FROZEN`                        | Yes                                                                |
| AI workspace          | `ai-workspace-plan`                     | medium                                                  | Plan problem                             | No: no plan problem state is documented                            |
| Bucket                | `bucket-usage`                          | info                                                    | Object count and size as returned        | Yes                                                                |
| Mail server, DNS zone | `mail-server-health`, `dns-zone-health` | medium                                                  | Health                                   | No: no health endpoint is documented                               |

- Run statuses: `ok`, `partial` (some resources had failures), `failed` (token invalid or expired, rate limit, or a database error), `skipped` (no token).
- Findings are deduplicated by a SHA-256 of resource kind, resource ID, and rule ID. Team accounts add the team ID to the key.
- Statuses: `new`, `ongoing`, `resolved`. A finding resolves only when its resource was fully checked in this run (no failed sources) and its rule ran.

## Documentation retrieval

- Source: `app/data/liara-docs/llms/**/*.md` (1,189 pages), copied from the Liara docs site. Each page keeps its `Original link`, which is the citation URL.
- The index is built in memory on first use. Search is BM25 scoring with Persian-aware text normalization. Full pages can be read with `read_liara_doc`.
- Live refresh: `refreshLiaraDocPage` fetches `https://docs.liara.ir/llms/<path>.md` with an 8 s timeout. If the fetch fails, it returns the local copy and an `error` message.
- To refresh the corpus, copy `docs/public/llms` again from the docs repository.

## Fix prompts

`generate_fix_prompt` builds a self-contained prompt for Claude Code, Cursor, Codex, or a generic agent from a finding. The prompt includes project and service context, the detection rule, redacted evidence fenced as untrusted data, matched Liara docs, inferences, a suggested investigation approach, constraints (no unrelated changes, no secrets), and verification steps. The Monitor dashboard offers the same four targets.

## Limitations

- **Not available as tools yet**: creating apps, deploying code (the only upload path is the Liara CLI, for local source), adding or deleting domains, enabling SSL, DNS, databases, and object storage (buckets). The assistant says so when asked. The Liara API documents most of these; see the list above.
- **Resource tagging**: the tag API exists, but no UI calls it yet. Until a resource is tagged, the checker falls back to all apps.
- **Checker coverage**: mail servers and DNS zones are not checked. Several rules are skipped because the API does not document the status values they need.
- **Metrics**: the metrics tool returns the last hour. The Liara console keeps hardware reports for 60 days (`paas/details/observations/hardware`), which the tool does not read. Values are shown as returned. No thresholds are applied, so resource findings are informational.
- **Logs**: each call returns up to 200 of the newest lines, and can look back up to 7 days. The response shape is taken from the spec. A live response that is not a list is an error, and it has not been tested against live data.
- **Restarts**: Liara does not document how long a restart takes. Zero-downtime deployment applies to deploys, not restarts.
- **Environment variables**: the spec does not say whether `update-envs` merges or replaces. The tool merges on its own side before it saves.
- **Releases**: the state field is a plain string with no documented values. The release-failed rule is skipped, so no finding is created for it.
- **Plans**: plan names, ids, and prices come from `GET /v1/me` as returned. The assistant does not invent them.
- **Rate limits**: not documented by Liara.
- **Verification**: the approval cards, ask-user cards, attachments, and folders have not been exercised end to end in a browser against a live account.
- **Chat length**: each reply can use up to 10 model steps, then the assistant stops.
- **Secrets**: if `.data/app-secret.key` or `APP_ENCRYPTION_KEY` changes, stored secrets cannot be decrypted and must be entered again.
- **Persistence**: SQLite is a single-file store, suitable for one instance. Serverless deployments need a persistent volume for `DATABASE_PATH`.

## Scripts

- `npm run dev`: development server
- `npm run build` / `npm start`: production build and server
- `npm run lint`: `oxlint` and a format check (`oxfmt`). `npm run lint:fix` applies fixes.
- `npx tsc --noEmit`: type check
- `npx drizzle-kit generate`: create a migration after changing `db/schema.ts` (migrations run on first database access)

## Deployment on Liara

Not verified in this repository. Suggested approach: deploy the `app` directory as a Node.js app, set `AVALAI_API_KEY` (or enter it in Settings), `CRON_SECRET`, and `APP_ENCRYPTION_KEY`, mount a persistent volume, and set `DATABASE_PATH` to a file on it. Keep `SCHEDULER_ENABLED=true` for an always-on process, or disable it and call `/api/cron/check` from a cron job.
