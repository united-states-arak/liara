import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const LIARA_DOCS_BASE = "https://docs.liara.ir";
export const LIARA_DOCS_DIR = path.join(process.cwd(), "data", "liara-docs", "llms");

export type LiaraDocPage = {
  url: string;
  path: string;
  title: string;
  markdown: string;
};

export type LiaraDocSection = {
  page: number;
  heading?: string;
  text: string;
};

export type LiaraDocsIndex = {
  pages: LiaraDocPage[];
  sections: LiaraDocSection[];
  postings: Map<string, { sections: number[]; weights: number[] }>;
  sectionLengths: number[];
  avgSectionLength: number;
  pageByUrl: Map<string, number>;
  builtAt: string;
};

type ParsedLiaraMarkdown = {
  originalUrl?: string;
  title?: string;
  markdown: string;
  sections: Array<{ heading?: string; text: string }>;
};

const TOKEN_RE = /[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/gu;

const RAW_STOPWORDS = [
  "و",
  "در",
  "به",
  "از",
  "که",
  "این",
  "آن",
  "را",
  "با",
  "است",
  "برای",
  "یک",
  "هم",
  "تا",
  "می",
  "ها",
  "های",
  "یا",
  "اگر",
  "بر",
  "نیز",
  "کنید",
  "کند",
  "شود",
  "شده",
  "باشد",
  "باشید",
  "دارد",
  "دارید",
  "هر",
  "پس",
  "خود",
  "آنها",
  "یه",
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
  "can",
  "should",
  "may",
  "not",
  "no",
];

const STOPWORDS = new Set(RAW_STOPWORDS.map((word) => normalizeText(word)));

const NOISE_LINE_PATTERNS: RegExp[] = [
  /^\s*import\s+(?:type\s+)?(?:[\w$*{}\s,]+\s+from\s+)?["'][^"']+["'];?\s*$/,
  /^\s*export\s+(?:default\s|const\s|let\s|var\s|function\s|async\s|class\s|type\s|interface\s|\{|\*)/,
  /^\s*<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>\s*$/,
  /^\s*<[A-Z][\w.]*(?:\s[^<>]*)?$/,
  /^\s*\/?>\s*$/,
  /^\s*<br\s*\/?>\s*$/i,
  /^\s*\{\s*[A-Za-z_$][\w$.]*\s*\}\s*$/,
  /^\s*\{\/\*.*\*\/\}\s*$/,
];

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u200c|\u200d|\u0640|[\u064b-\u065f\u0670]/g, "")
    .replace(/[\u064a\u0649]/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0623\u0625]/g, "\u0627")
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function wordsOf(text: string): string[] {
  return normalizeText(text).match(TOKEN_RE) ?? [];
}

function isIndexable(token: string): boolean {
  return (token.length > 1 || /\d/.test(token)) && !STOPWORDS.has(token);
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of wordsOf(text)) {
    if (isIndexable(word)) out.push(word);
    if (word.includes(".") || word.includes("-")) {
      for (const part of word.split(/[.-]/)) {
        if (isIndexable(part)) out.push(part);
      }
    }
  }
  return out;
}

export function termVariants(token: string): string[] {
  for (const suffix of ["های", "ها"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return [token, token.slice(0, -suffix.length)];
    }
  }
  return [token];
}

export function phraseOf(text: string): string {
  return wordsOf(text).join(" ");
}

export function canonicalDocUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.liara.ir" ||
    url.username ||
    url.password
  ) {
    return null;
  }
  const docPath = url.pathname
    .replace(/^\/llms(?=\/|$)/, "")
    .replace(/\.md$/i, "")
    .replace(/\/+$/, "");
  return `${LIARA_DOCS_BASE}${docPath}/`;
}

export function isLiaraDocsUrl(input: string): boolean {
  return typeof input === "string" && input.length <= 2048 && canonicalDocUrl(input) !== null;
}

function markCodeLines(lines: string[]): boolean[] {
  const flags: boolean[] = [];
  let open: { char: string; length: number } | null = null;
  for (const line of lines) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!open) {
      if (match) {
        open = { char: match[1][0], length: match[1].length };
        flags.push(true);
      } else {
        flags.push(false);
      }
      continue;
    }
    flags.push(true);
    if (
      match &&
      match[1][0] === open.char &&
      match[1].length >= open.length &&
      /^\s*(`{3,}|~{3,})\s*$/.test(line)
    ) {
      open = null;
    }
  }
  return flags;
}

function stripNoise(lines: string[], code: boolean[]): string[] {
  const out: string[] = [];
  let inComment = false;
  lines.forEach((raw, i) => {
    if (code[i]) {
      out.push(raw);
      return;
    }
    let line = raw;
    if (inComment) {
      const end = line.indexOf("-->");
      if (end === -1) return;
      line = line.slice(end + 3);
      inComment = false;
    }
    for (let start = line.indexOf("<!--"); start !== -1; start = line.indexOf("<!--")) {
      const end = line.indexOf("-->", start + 4);
      if (end === -1) {
        line = line.slice(0, start);
        inComment = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 3);
    }
    if (NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line))) return;
    out.push(line);
  });
  return out;
}

export function parseLiaraMarkdown(raw: string): ParsedLiaraMarkdown {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  let originalUrl: string | undefined;
  const headerIndex = lines
    .slice(0, 5)
    .findIndex((line) => line.trim().startsWith("Original link:"));
  if (headerIndex !== -1) {
    originalUrl = lines[headerIndex].trim().slice("Original link:".length).trim() || undefined;
    lines.splice(headerIndex, 1);
  }

  const cleaned = stripNoise(lines, markCodeLines(lines));
  const code = markCodeLines(cleaned);

  let title: string | undefined;
  for (let i = 0; i < cleaned.length && title === undefined; i++) {
    if (code[i]) continue;
    const match = /^#\s+(.+?)\s*$/.exec(cleaned[i]);
    if (match) title = match[1].trim();
  }

  const groups: Array<{ heading?: string; lines: string[] }> = [{ lines: [] }];
  for (let i = 0; i < cleaned.length; i++) {
    const match = code[i] ? null : /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(cleaned[i]);
    if (match) {
      groups.push({ heading: match[2].trim(), lines: [cleaned[i]] });
    } else {
      groups[groups.length - 1].lines.push(cleaned[i]);
    }
  }

  const sections: Array<{ heading?: string; text: string }> = [];
  for (const group of groups) {
    const text = group.lines.join("\n").trim();
    if (!text) continue;
    if (group.heading === undefined) {
      const body = text.replace(/^#\s+.*$/m, "").trim();
      if (body) sections.push({ text });
    } else {
      const body = group.lines.slice(1).join("\n").trim();
      if (body) sections.push({ heading: group.heading, text });
    }
  }

  return {
    originalUrl,
    title,
    markdown: cleaned.join("\n").trim(),
    sections,
  };
}

function titleFromPath(relPath: string): string {
  const last = relPath.split("/").pop() ?? relPath;
  return last.replace(/\.md$/i, "").replace(/-/g, " ");
}

export function buildLiaraDocsIndex(
  files: Array<{ rel: string; raw: string }>,
  builtAt: string = new Date().toISOString(),
): LiaraDocsIndex {
  const pages: LiaraDocPage[] = [];
  const sections: LiaraDocSection[] = [];
  const pageByUrl = new Map<string, number>();

  for (const { rel, raw } of files) {
    const parsed = parseLiaraMarkdown(raw);
    const fallbackPath = rel.replace(/\.md$/i, "");
    const url = canonicalDocUrl(parsed.originalUrl ?? "") ?? `${LIARA_DOCS_BASE}/${fallbackPath}/`;
    if (pageByUrl.has(url)) continue;

    const pageIndex = pages.length;
    pages.push({
      url,
      path: rel,
      title: parsed.title ?? titleFromPath(fallbackPath),
      markdown: parsed.markdown,
    });
    pageByUrl.set(url, pageIndex);
    for (const section of parsed.sections) {
      sections.push({ page: pageIndex, heading: section.heading, text: section.text });
    }
  }

  const postings = new Map<string, { sections: number[]; weights: number[] }>();
  const sectionLengths: number[] = [];
  let totalLength = 0;

  sections.forEach((section, docId) => {
    const termWeights = new Map<string, number>();
    let length = 0;
    const add = (text: string, boost: number) => {
      for (const token of tokenize(text)) {
        length += boost;
        for (const term of termVariants(token)) {
          termWeights.set(term, (termWeights.get(term) ?? 0) + boost);
        }
      }
    };
    add(section.text, 1);
    if (section.heading) add(section.heading, 2);
    add(pages[section.page].title, 2);

    sectionLengths.push(length || 1);
    totalLength += length || 1;

    for (const [term, weight] of termWeights) {
      let posting = postings.get(term);
      if (!posting) {
        posting = { sections: [], weights: [] };
        postings.set(term, posting);
      }
      posting.sections.push(docId);
      posting.weights.push(weight);
    }
  });

  return {
    pages,
    sections,
    postings,
    sectionLengths,
    avgSectionLength: sections.length ? totalLength / sections.length : 1,
    pageByUrl,
    builtAt,
  };
}

async function listMarkdownFiles(dir: string, rel = ""): Promise<string[]> {
  const entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(dir, entryRel)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryRel);
    }
  }
  return files.sort();
}

async function readLiaraDocFiles(): Promise<Array<{ rel: string; raw: string }>> {
  let rels: string[];
  try {
    rels = await listMarkdownFiles(LIARA_DOCS_DIR);
  } catch (err) {
    console.warn(`[liara-docs] cannot read ${LIARA_DOCS_DIR}`, err);
    return [];
  }
  const files: Array<{ rel: string; raw: string }> = [];
  for (let i = 0; i < rels.length; i += 100) {
    const chunk = await Promise.all(
      rels.slice(i, i + 100).map(async (rel) => ({
        rel,
        raw: await readFile(path.join(LIARA_DOCS_DIR, rel), "utf8"),
      })),
    );
    files.push(...chunk);
  }
  return files;
}

let indexPromise: Promise<LiaraDocsIndex> | null = null;

export function loadLiaraDocsIndex(): Promise<LiaraDocsIndex> {
  if (!indexPromise) {
    indexPromise = readLiaraDocFiles()
      .then((files) => buildLiaraDocsIndex(files))
      .catch((err: unknown) => {
        console.error("[liara-docs] failed to build index", err);
        indexPromise = null;
        return buildLiaraDocsIndex([]);
      });
  }
  return indexPromise;
}
