import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 4;

export class SourceError extends Error {}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    return (
      a === "::1" ||
      a === "::" ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      a.startsWith("fe80") ||
      a.startsWith("::ffff:127.") ||
      a.startsWith("::ffff:10.") ||
      a.startsWith("::ffff:192.168.")
    );
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new SourceError("Only https:// source URLs are allowed.");
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SourceError("That host is not allowed.");
  }
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw new SourceError("Could not resolve the source host.");
  if (addresses.some(isPrivateAddress)) throw new SourceError("That host is not allowed.");
}

/**
 * GitHub repo page URLs become codeload archive URLs. Returns candidates to try in order.
 */
export function archiveCandidates(input: string, branch?: string): string[] {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SourceError("The source URL is not valid.");
  }
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/, "");
    if (!owner || !repo) throw new SourceError("Use a link like https://github.com/owner/repo.");
    const fromUrl = parts[2] === "tree" && parts[3] ? parts.slice(3).join("/") : undefined;
    const branches = branch ? [branch] : fromUrl ? [fromUrl] : ["main", "master"];
    return branches.map(
      (name) =>
        `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${encodeURIComponent(name).replace(/%2F/g, "/")}`,
    );
  }
  return [url.toString()];
}

async function download(url: string): Promise<Blob | "missing"> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, { redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new SourceError("The source host redirected without a target.");
        current = new URL(location, current);
        continue;
      }
      if (res.status === 404) return "missing";
      if (!res.ok) throw new SourceError(`The source host answered HTTP ${res.status}.`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_ARCHIVE_BYTES) throw new SourceError("The source archive is over 100 MB.");
      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
        throw new SourceError("The source archive is over 100 MB.");
      }
      if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
        throw new SourceError("The link did not return a .tar.gz archive.");
      }
      return new Blob([buffer], { type: "application/gzip" });
    } catch (error) {
      if (error instanceof SourceError) throw error;
      throw new SourceError("Could not download the source archive.");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SourceError("Too many redirects while downloading the source.");
}

export async function fetchSourceArchive(
  input: string,
  branch?: string,
): Promise<{ blob: Blob; url: string }> {
  for (const candidate of archiveCandidates(input, branch)) {
    const blob = await download(candidate);
    if (blob !== "missing") return { blob, url: candidate };
  }
  throw new SourceError("The repository or branch was not found (private repos are not supported).");
}

export type ExtraFile = { path: string; content: string };

const MAX_EXTRA_FILES = 10;
const MAX_EXTRA_BYTES = 40_000;

function safeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === ".." || part === "") ||
    normalized.length > 200
  ) {
    throw new SourceError(`Invalid file path "${input}".`);
  }
  return normalized;
}

/**
 * Repacks a downloaded archive the way the Liara CLI uploads sources: no wrapper folder
 * (GitHub archives have one), with optional generated files such as a Dockerfile added or replaced.
 */
export async function repackArchive(blob: Blob, files: readonly ExtraFile[] = []): Promise<Blob> {
  if (files.length > MAX_EXTRA_FILES) throw new SourceError("Too many extra files.");
  if (files.reduce((sum, file) => sum + file.content.length, 0) > MAX_EXTRA_BYTES) {
    throw new SourceError("The extra files are too large.");
  }
  const tar = await import("tar");
  const { mkdtemp, mkdir, writeFile, readFile, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const pathMod = await import("node:path");
  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");

  const work = await mkdtemp(pathMod.join(tmpdir(), "liara-src-"));
  const tree = pathMod.join(work, "tree");
  const out = pathMod.join(work, "out.tgz");
  try {
    await mkdir(tree);
    const bytes = Buffer.from(await blob.arrayBuffer());
    await pipeline(Readable.from(bytes), tar.x({ cwd: tree, strip: 1 }));
    for (const file of files) {
      const rel = safeRelativePath(file.path);
      const target = pathMod.join(tree, rel);
      await mkdir(pathMod.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    const entries = await readdir(tree);
    if (entries.length === 0) throw new SourceError("The archive is empty.");
    await tar.c({ gzip: true, cwd: tree, file: out, portable: true }, entries);
    const packed = await readFile(out);
    if (packed.byteLength > MAX_ARCHIVE_BYTES) throw new SourceError("The repacked source is over 100 MB.");
    return new Blob([new Uint8Array(packed)], { type: "application/gzip" });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError("Could not prepare the source archive.");
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
