import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fetchSourceArchive, SourceError } from "./source-fetch";

const CACHE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 220;
const MAX_FILE_CHARS = 8000;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".venv", "__pycache__", "vendor", ".astro", ".svelte-kit", "target"]);

type Cached = { dir: string; expires: number; url: string };
const cache = new Map<string, Cached>();

async function sweep() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires < now) {
      cache.delete(key);
      await rm(entry.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function loadRepo(sourceUrl: string, branch?: string): Promise<Cached> {
  await sweep();
  const key = `${sourceUrl}#${branch ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const archive = await fetchSourceArchive(sourceUrl, branch);
  const tar = await import("tar");
  const dir = await mkdtemp(path.join(tmpdir(), "liara-repo-"));
  try {
    const bytes = Buffer.from(await archive.blob.arrayBuffer());
    await pipeline(
      Readable.from(bytes),
      tar.x({
        cwd: dir,
        strip: 1,
        filter: (entryPath, entry) =>
          !("type" in entry && (entry.type === "SymbolicLink" || entry.type === "Link")) &&
          !entryPath.split("/").some((part) => part === "node_modules" || part === ".git"),
      }),
    );
  } catch {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new SourceError("Could not unpack the repository.");
  }
  const entry = { dir, expires: Date.now() + CACHE_MS, url: archive.url };
  cache.set(key, entry);
  return entry;
}

async function tree(root: string, rel = "", depth = 0, out: string[] = []): Promise<string[]> {
  if (out.length >= MAX_ENTRIES) return out;
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= MAX_ENTRIES) break;
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(`${next}/`);
      if (depth < 2) await tree(root, next, depth + 1, out);
    } else {
      out.push(next);
    }
  }
  return out;
}

async function readText(file: string, max = MAX_FILE_CHARS): Promise<string | undefined> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 2_000_000) return undefined;
    const buf = await readFile(file);
    if (buf.subarray(0, 2000).includes(0)) return undefined;
    return buf.toString("utf8").slice(0, max);
  } catch {
    return undefined;
  }
}

function envKeys(text: string | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1]).slice(0, 60);
}

const FRAMEWORKS: Array<[string, string]> = [
  ["next", "Next.js"],
  ["astro", "Astro"],
  ["nuxt", "Nuxt"],
  ["@sveltejs/kit", "SvelteKit"],
  ["@remix-run/node", "Remix"],
  ["react-router", "React Router"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
  ["vite", "Vite"],
  ["react-scripts", "Create React App"],
  ["@angular/core", "Angular"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["gatsby", "Gatsby"],
  ["@strapi/strapi", "Strapi"],
  ["ghost", "Ghost"],
];

export type RepoInspection = {
  source: string;
  files: string[];
  filesTruncated: boolean;
  detected: {
    language?: string;
    framework?: string;
    packageManager?: string;
    nodeVersion?: string;
    scripts?: Record<string, string>;
    hasDockerfile: boolean;
    dockerfile?: string;
    dockerCompose?: string;
    envExampleKeys: string[];
    databases: string[];
    notes: string[];
  };
  hint: { platform: string; port?: number; why: string };
  readme?: string;
};

export async function inspectRepo(sourceUrl: string, branch?: string): Promise<RepoInspection> {
  const repo = await loadRepo(sourceUrl, branch);
  const root = repo.dir;
  const files = await tree(root);
  const has = (name: string) => files.includes(name);
  const notes: string[] = [];
  const databases = new Set<string>();

  const pkgText = await readText(path.join(root, "package.json"), 20000);
  let pkg: Record<string, any> | undefined;
  try {
    pkg = pkgText ? JSON.parse(pkgText) : undefined;
  } catch {
    notes.push("package.json is not valid JSON.");
  }
  const deps: Record<string, string> = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const depNames = Object.keys(deps);
  const framework = FRAMEWORKS.find(([dep]) => dep in deps)?.[1];

  for (const [dep, label] of [
    ["pg", "PostgreSQL"], ["postgres", "PostgreSQL"], ["@prisma/client", "Prisma (see schema)"], ["mysql2", "MySQL"],
    ["mysql", "MySQL"], ["mongodb", "MongoDB"], ["mongoose", "MongoDB"], ["redis", "Redis"], ["ioredis", "Redis"],
    ["better-sqlite3", "SQLite (file; needs a disk)"], ["sqlite3", "SQLite (file; needs a disk)"], ["drizzle-orm", "Drizzle (see config)"],
  ] as const) if (dep in deps) databases.add(label);

  const prismaSchema = await readText(path.join(root, "prisma/schema.prisma"), 4000);
  const provider = prismaSchema?.match(/provider\s*=\s*"(\w+)"/g)?.map((m) => m.split('"')[1]).find((p) => p !== "prisma-client-js");
  if (provider) databases.add(`Prisma provider: ${provider}`);

  let language: string | undefined = pkg ? "Node.js / JavaScript" : undefined;
  let hint = { platform: "docker", port: undefined as number | undefined, why: "No known framework detected; a Dockerfile is the safest route." };
  const packageManager = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") || has("bun.lock") ? "bun" : has("package-lock.json") ? "npm" : undefined;

  if (pkg) {
    const scripts: Record<string, string> = pkg.scripts ?? {};
    if (framework === "Next.js") hint = { platform: "next", port: 3000, why: "Next.js has a Liara platform." };
    else if (framework === "Astro") {
      const config = (await readText(path.join(root, "astro.config.mjs"))) ?? (await readText(path.join(root, "astro.config.ts"))) ?? "";
      const ssr = /output\s*:\s*['"](server|hybrid)['"]/.test(config) || "@astrojs/node" in deps;
      hint = ssr
        ? { platform: "docker", port: 4321, why: "Astro with a server adapter: needs a Dockerfile that builds then runs node ./dist/server/entry.mjs." }
        : { platform: "docker", port: 80, why: "Static Astro site: Liara has no Astro platform; build with node and serve dist with nginx (Dockerfile)." };
    } else if (framework === "SvelteKit" || framework === "Remix" || framework === "Nuxt") {
      hint = { platform: "docker", port: 3000, why: `${framework} has no dedicated Liara platform; use a Dockerfile (or the node platform if start works).` };
    } else if (framework === "Vite" || framework === "Create React App" || framework === "Vue" || framework === "Svelte") {
      hint = { platform: "docker", port: 80, why: "Single-page app: build, then serve the output folder with nginx (Dockerfile)." };
    } else if (scripts.start) {
      hint = { platform: "node", port: 3000, why: "Has a start script; the node platform runs npm install, build and start." };
    }
    return finish();
  }

  async function finish(): Promise<RepoInspection> {
    const dockerfile = await readText(path.join(root, "Dockerfile"), 3000);
    const compose = (await readText(path.join(root, "docker-compose.yml"), 2500)) ?? (await readText(path.join(root, "docker-compose.yaml"), 2500)) ?? (await readText(path.join(root, "compose.yaml"), 2500));
    if (dockerfile) {
      hint = { platform: "docker", port: Number(dockerfile.match(/EXPOSE\s+(\d+)/)?.[1]) || hint.port, why: "The repo already has a Dockerfile; use the docker platform." };
    }
    const example = (await readText(path.join(root, ".env.example"))) ?? (await readText(path.join(root, ".env.sample"))) ?? (await readText(path.join(root, ".env.template"))) ?? (await readText(path.join(root, ".env")));
    const readme = await readText(path.join(root, "README.md"), 1500);
    const nodeVersion = pkg?.engines?.node ?? (await readText(path.join(root, ".nvmrc"), 20))?.trim();
    return {
      source: repo.url,
      files,
      filesTruncated: files.length >= MAX_ENTRIES,
      detected: {
        language,
        framework,
        packageManager,
        nodeVersion,
        scripts: pkg?.scripts,
        hasDockerfile: Boolean(dockerfile),
        dockerfile: dockerfile,
        dockerCompose: compose,
        envExampleKeys: envKeys(example),
        databases: [...databases],
        notes,
      },
      hint,
      readme: readme,
    };
  }

  // Non-Node projects
  const req = (await readText(path.join(root, "requirements.txt"), 3000)) ?? (await readText(path.join(root, "pyproject.toml"), 3000)) ?? "";
  if (req || has("manage.py")) {
    language = "Python";
    if (has("manage.py") || /django/i.test(req)) hint = { platform: "django", port: 8000, why: "Django project (manage.py)." };
    else if (/flask/i.test(req)) hint = { platform: "flask", port: 8000, why: "Flask dependency found." };
    else hint = { platform: "python", port: 8000, why: "Python project." };
    if (/psycopg|asyncpg/i.test(req)) databases.add("PostgreSQL");
    if (/mysqlclient|pymysql/i.test(req)) databases.add("MySQL");
    if (/pymongo/i.test(req)) databases.add("MongoDB");
    return finish();
  }
  if (has("composer.json")) {
    language = "PHP";
    const composer = (await readText(path.join(root, "composer.json"), 6000)) ?? "";
    hint = /laravel\/framework/.test(composer)
      ? { platform: "laravel", port: 80, why: "Laravel project (composer.json)." }
      : { platform: "php", port: 80, why: "PHP project (composer.json)." };
    return finish();
  }
  if (has("go.mod")) {
    language = "Go";
    hint = { platform: "go", port: 8080, why: "go.mod found." };
    return finish();
  }
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) {
    language = ".NET";
    hint = { platform: "dotnet", port: 8080, why: ".NET project file found." };
    return finish();
  }
  if (has("index.html")) {
    hint = { platform: "static", port: 80, why: "Plain HTML site; the static platform serves it as is." };
    language = "HTML";
  }
  return finish();
}

export async function readRepoFile(
  sourceUrl: string,
  filePath: string,
  branch?: string,
  maxChars = MAX_FILE_CHARS,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normalized || normalized.split("/").includes("..")) throw new SourceError("Invalid file path.");
  if (normalized === ".git" || normalized.startsWith(".git/")) throw new SourceError("Invalid file path.");
  const repo = await loadRepo(sourceUrl, branch);
  const full = path.join(repo.dir, normalized);
  if (!full.startsWith(repo.dir + path.sep)) throw new SourceError("Invalid file path.");
  const text = await readText(full, Math.min(maxChars, MAX_FILE_CHARS) + 1);
  if (text === undefined) throw new SourceError("File not found, binary or too large.");
  const limit = Math.min(maxChars, MAX_FILE_CHARS);
  return { path: normalized, content: text.slice(0, limit), truncated: text.length > limit };
}
