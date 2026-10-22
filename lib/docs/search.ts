import {
  LIARA_DOCS_BASE,
  canonicalDocUrl,
  loadLiaraDocsIndex,
  normalizeText,
  parseLiaraMarkdown,
  phraseOf,
  termVariants,
  tokenize,
  type LiaraDocsIndex,
} from "./index-builder";

export type LiaraDocSearchResult = {
  title: string;
  url: string;
  section?: string;
  excerpt: string;
  score: number;
};

export type LiaraDocPageContent = {
  title: string;
  url: string;
  markdown: string;
};

export type LiaraDocRefresh = {
  source: "live" | "local";
  markdown: string;
  fetchedAt: string;
  error?: string;
};

const K1 = 1.2;
const B = 0.75;
const MAX_QUERY_CHARS = 300;
const EXCERPT_MAX = 400;
const EXCERPT_LEAD = 80;
const PAGE_CAP = 2;
const PHRASE_BONUS = 1.25;
const RERANK_POOL = 50;
const LIVE_TIMEOUT_MS = 8000;
const LIVE_MAX_CHARS = 2_000_000;
const EXPANSION_WEIGHT = 0.5;
const STEM_WEIGHT = 0.8;

const SYNONYM_GROUPS: string[][] = [
  ["deploy", "deployment", "دیپلوی", "دپلوی", "استقرار"],
  ["restart", "reboot", "ری‌استارت", "ری استارت", "ریستارت", "راه‌اندازی مجدد", "راه اندازی مجدد"],
  ["log", "logs", "لاگ", "لاگ‌ها", "لاگ ها"],
  [
    "env",
    "env var",
    "env vars",
    "environment variable",
    "environment variables",
    "متغیر محیطی",
    "متغیرهای محیطی",
  ],
  ["install", "installation", "نصب", "نصب کردن"],
  ["memory", "ram", "oom", "حافظه", "رم"],
  ["domain", "custom domain", "دامنه", "دامنه سفارشی"],
  ["port", "پورت"],
  ["build", "building", "بیلد"],
  ["database", "db", "دیتابیس", "پایگاه داده"],
  ["ssl", "https", "certificate", "گواهی", "گواهینامه"],
  ["dockerfile", "docker", "داکرفایل", "داکر فایل"],
  ["volume", "volumes", "ولوم", "حجم ذخیره‌سازی"],
];

function addWeight(weights: Map<string, number>, term: string, weight: number) {
  if (weight > (weights.get(term) ?? 0)) weights.set(term, weight);
}

function buildQuery(query: string): { weights: Map<string, number>; phrase: string } {
  const weights = new Map<string, number>();
  const words = tokenize(query);

  for (const word of words) {
    for (const variant of termVariants(word)) {
      addWeight(weights, variant, variant === word ? 1 : STEM_WEIGHT);
    }
  }

  const padded = ` ${phraseOf(query)} `;
  for (const group of SYNONYM_GROUPS) {
    const matched = group.some((variant) => {
      const phrase = phraseOf(variant);
      return phrase.length > 0 && padded.includes(` ${phrase} `);
    });
    if (!matched) continue;
    for (const variant of group) {
      for (const token of tokenize(variant)) {
        for (const term of termVariants(token)) {
          addWeight(weights, term, EXPANSION_WEIGHT);
        }
      }
    }
  }

  return { weights, phrase: words.length >= 2 ? words.join(" ") : "" };
}

function makeExcerpt(text: string, terms: Set<string>): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= EXCERPT_MAX) return flat;

  const hits: number[] = [];
  for (const match of flat.matchAll(/[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/gu)) {
    const normalized = normalizeText(match[0]);
    if (termVariants(normalized).some((term) => terms.has(term)) && match.index !== undefined) {
      hits.push(match.index);
    }
  }

  const windowSize = EXCERPT_MAX - 2;
  let start = 0;
  if (hits.length) {
    let bestCount = -1;
    for (const hit of hits) {
      const candidate = Math.max(0, hit - EXCERPT_LEAD);
      const count = hits.filter((pos) => pos >= candidate && pos < candidate + windowSize).length;
      if (count > bestCount) {
        bestCount = count;
        start = candidate;
      }
    }
  }

  const prefix = start > 0 ? "…" : "";
  const body = flat.slice(start, start + windowSize).trim();
  const suffix = start + windowSize < flat.length ? "…" : "";
  return `${prefix}${body}${suffix}`;
}

function bm25Scores(index: LiaraDocsIndex, weights: Map<string, number>): Map<number, number> {
  const scores = new Map<number, number>();
  const docCount = index.sections.length;

  for (const [term, queryWeight] of weights) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    const df = posting.sections.length;
    const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));

    for (let i = 0; i < posting.sections.length; i++) {
      const doc = posting.sections[i];
      const tf = posting.weights[i];
      const lengthNorm = 1 - B + B * (index.sectionLengths[doc] / index.avgSectionLength);
      const contribution = (idf * tf * (K1 + 1)) / (tf + K1 * lengthNorm);
      scores.set(doc, (scores.get(doc) ?? 0) + queryWeight * contribution);
    }
  }

  return scores;
}

export async function searchLiaraDocs({
  query,
  limit = 5,
}: {
  query: string;
  limit?: number;
}): Promise<LiaraDocSearchResult[]> {
  const trimmed = typeof query === "string" ? query.trim().slice(0, MAX_QUERY_CHARS) : "";
  if (!trimmed) return [];

  const max = Math.min(10, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 5)));
  const index = await loadLiaraDocsIndex();
  const { weights, phrase } = buildQuery(trimmed);
  if (weights.size === 0 || index.sections.length === 0) return [];

  const scores = bm25Scores(index, weights);
  if (scores.size === 0) return [];

  let ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, RERANK_POOL);
  if (phrase) {
    ranked = ranked
      .map(([doc, score]): [number, number] => {
        const sectionTokens = ` ${tokenize(index.sections[doc].text).join(" ")} `;
        return [doc, sectionTokens.includes(` ${phrase} `) ? score * PHRASE_BONUS : score];
      })
      .sort((a, b) => b[1] - a[1]);
  }

  const terms = new Set(weights.keys());
  const perPage = new Map<number, number>();
  const results: LiaraDocSearchResult[] = [];

  for (const [doc, score] of ranked) {
    const section = index.sections[doc];
    const page = index.pages[section.page];
    const used = perPage.get(section.page) ?? 0;
    if (used >= PAGE_CAP) continue;
    perPage.set(section.page, used + 1);

    results.push({
      title: page.title,
      url: page.url,
      section: section.heading,
      excerpt: makeExcerpt(section.text, terms),
      score: Math.round(score * 1000) / 1000,
    });
    if (results.length >= max) break;
  }

  return results;
}

export async function getLiaraDocByUrl(url: string): Promise<LiaraDocPageContent | null> {
  const key = canonicalDocUrl(url);
  if (!key) return null;
  const index = await loadLiaraDocsIndex();
  const pageIndex = index.pageByUrl.get(key);
  if (pageIndex === undefined) return null;
  const page = index.pages[pageIndex];
  return { title: page.title, url: page.url, markdown: page.markdown };
}

export async function refreshLiaraDocPage(url: string): Promise<LiaraDocRefresh> {
  const index = await loadLiaraDocsIndex();
  const key = canonicalDocUrl(url);

  if (!key) {
    return {
      source: "local",
      markdown: "",
      fetchedAt: index.builtAt,
      error: "URL must be an https://docs.liara.ir/ address",
    };
  }

  const local = await getLiaraDocByUrl(key);
  const slug = key.slice(LIARA_DOCS_BASE.length).replace(/\/$/, "");
  if (!slug) {
    return {
      source: "local",
      markdown: "",
      fetchedAt: index.builtAt,
      error: "Not a documentation page URL",
    };
  }

  const liveUrl = `${LIARA_DOCS_BASE}/llms${slug}.md`;
  try {
    const response = await fetch(liveUrl, {
      headers: { accept: "text/markdown, text/plain;q=0.9" },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url) {
      const finalUrl = new URL(response.url);
      if (finalUrl.hostname !== "docs.liara.ir")
        throw new Error("Redirected outside docs.liara.ir");
    }

    const text = await response.text();
    if (text.length > LIVE_MAX_CHARS) throw new Error("Response too large");
    if (/^\s*<(!doctype html|html)/i.test(text.slice(0, 200))) {
      throw new Error("Expected markdown but received HTML");
    }

    const markdown = parseLiaraMarkdown(text).markdown;
    if (!markdown) throw new Error("Empty document");

    return { source: "live", markdown, fetchedAt: new Date().toISOString() };
  } catch (err) {
    const reason =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? `timed out after ${LIVE_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      source: "local",
      markdown: local?.markdown ?? "",
      fetchedAt: index.builtAt,
      error: local
        ? `Live fetch failed (${reason}); returning local copy`
        : `Live fetch failed (${reason}); no local copy found`,
    };
  }
}

export async function docsIndexInfo(): Promise<{
  pages: number;
  sections: number;
  builtAt: string;
}> {
  const index = await loadLiaraDocsIndex();
  return {
    pages: index.pages.length,
    sections: index.sections.length,
    builtAt: index.builtAt,
  };
}
