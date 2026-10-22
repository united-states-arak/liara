export const THREAD_TITLE_MAX_CHARS = 60;

export function titleFromText(text: string): string | undefined {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  if (flat.length <= THREAD_TITLE_MAX_CHARS) return flat;
  return `${flat.slice(0, THREAD_TITLE_MAX_CHARS - 1).trimEnd()}…`;
}
