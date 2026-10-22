const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now: number): string {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return "unknown";

  const diff = target - now;
  const past = diff < 0;
  const abs = Math.abs(diff);

  if (abs < MINUTE) {
    const seconds = Math.max(1, Math.round(abs / 1000));
    return past ? "just now" : `in ${seconds} s`;
  }

  let amount: string;
  if (abs < HOUR) amount = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) amount = `${Math.round(abs / HOUR)} h`;
  else amount = `${Math.round(abs / DAY)} d`;

  return past ? `${amount} ago` : `in ${amount}`;
}

export function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    undefined,
    sameDay ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" },
  );
}

export function formatInterval(minutes: number): string {
  if (minutes >= 120 && minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes === 60) return "hour";
  if (minutes >= 1) return `${Math.round(minutes * 10) / 10} min`;
  return `${Math.round(minutes * 60)} s`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function classifyError(message: string): string | null {
  if (/token|unauthori[sz]ed|forbidden|expired|\b40[13]\b/i.test(message)) {
    return "Token problem";
  }
  if (/rate|too many requests|quota|\b429\b/i.test(message)) {
    return "Rate limited";
  }
  return null;
}
