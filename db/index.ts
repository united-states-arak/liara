import path from "node:path";
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "starcoach.db");

type Db = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __starcoachDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__starcoachDb) {
    globalForDb.__starcoachDb = (async () => {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const client = createClient({ url: `file:${DB_PATH}` });
      const db = drizzle(client, { schema });
      await migrate(db, {
        migrationsFolder: path.join(process.cwd(), "db", "migrations"),
      });
      return db;
    })();
  }
  return globalForDb.__starcoachDb;
}

export { schema };
