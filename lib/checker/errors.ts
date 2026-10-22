import { LiaraError } from "@/lib/liara/client";
import { redact } from "@/lib/redact";

export function isFatal(error: unknown): boolean {
  return error instanceof LiaraError && (error.kind === "auth" || error.kind === "rate_limited");
}

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";
  return redact(message).slice(0, 300);
}
