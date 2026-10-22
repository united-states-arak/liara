import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teamKey: text("team_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    title: text("title"),
    status: text("status", { enum: ["regular", "archived"] })
      .notNull()
      .default("regular"),
    teamKey: text("team_key").notNull().default("personal"),
    folderId: text("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("threads_team_idx").on(t.teamKey)],
);

export const resourceSnapshots = sqliteTable(
  "resource_snapshots",
  {
    teamKey: text("team_key").notNull(),
    kind: text("kind", {
      enum: ["app", "database", "bucket", "vm", "ai_workspace", "mail_server", "dns_zone"],
    }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.teamKey, t.kind] })],
);

export const resourceTags = sqliteTable(
  "resource_tags",
  {
    id: text("id").primaryKey(),
    teamKey: text("team_key").notNull(),
    kind: text("kind", {
      enum: ["app", "database", "bucket", "vm", "ai_workspace", "mail_server", "dns_zone"],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    name: text("name").notNull(),
    monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("resource_tags_unique").on(t.teamKey, t.kind, t.resourceId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
    uiMessage: text("ui_message", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("messages_thread_idx").on(t.threadId)],
);

export const checkRuns = sqliteTable("check_runs", {
  id: text("id").primaryKey(),
  /** Liara team the run checked. Null means the personal account. */
  teamId: text("team_id"),
  trigger: text("trigger", { enum: ["scheduled", "manual"] }).notNull(),
  status: text("status", {
    enum: ["running", "ok", "partial", "failed", "skipped"],
  }).notNull(),
  error: text("error"),
  projectsChecked: integer("projects_checked").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey(),
    /** Liara team the finding belongs to. Null means the personal account. */
    teamId: text("team_id"),
    fingerprint: text("fingerprint").notNull().unique(),
    ruleId: text("rule_id").notNull(),
    /** Resource kind the finding belongs to. Defaults to app for older rows. */
    kind: text("kind", {
      enum: ["app", "database", "bucket", "vm", "ai_workspace", "mail_server", "dns_zone"],
    })
      .notNull()
      .default("app"),
    /** Stable id of the resource at Liara (falls back to the name). */
    resourceId: text("resource_id"),
    projectName: text("project_name").notNull(),
    serviceName: text("service_name"),
    severity: text("severity", {
      enum: ["critical", "high", "medium", "low", "info"],
    }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    evidence: text("evidence", { mode: "json" })
      .$type<Array<{ label: string; value: string }>>()
      .notNull(),
    status: text("status", { enum: ["new", "ongoing", "resolved"] })
      .notNull()
      .default("new"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    lastRunId: text("last_run_id").references(() => checkRuns.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("findings_status_idx").on(t.status)],
);
