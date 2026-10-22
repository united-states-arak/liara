const REDACTED = "[REDACTED]";

const SECRET_KEY = String.raw`[\w.-]*(?:token|password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credentials?)[\w.-]*`;

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  [
    new RegExp(`(${SECRET_KEY}["']?\\s*[=:]\\s*)(["']?)([^\\s"'&,;]+)\\2`, "gi"),
    `$1$2${REDACTED}$2`,
  ],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)([^@\s/]+)(@)/gi, `$1${REDACTED}$3`],
  [/\b[a-f0-9]{32,}\b/gi, REDACTED],
  [
    /(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g,
    REDACTED,
  ],
];

export type EnvLike = {
  key?: string;
  value?: string;
  encrypted?: boolean;
};

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  const literal = secrets
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of literal) {
    out = out.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function encryptedEnvValues(
  project: { envs?: ReadonlyArray<EnvLike> | null } | null | undefined,
): string[] {
  return (project?.envs ?? [])
    .filter(
      (env) => env.encrypted === true && typeof env.value === "string" && env.value.length > 0,
    )
    .map((env) => env.value as string);
}

export function redactEnvValues(
  text: string,
  project: { envs?: ReadonlyArray<EnvLike> | null } | null | undefined,
): string {
  return redact(text, encryptedEnvValues(project));
}
