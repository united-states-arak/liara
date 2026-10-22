"use client";

import { cn } from "@/lib/utils";

const DOT_DELAYS = ["0ms", "150ms", "300ms"];

export function PendingIndicator({
  label = "Working",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Assistant is working"
      data-slot="aui_assistant-message-indicator"
      className={cn(
        "text-muted-foreground inline-flex items-center gap-3 py-1.5 text-sm font-medium",
        className,
      )}
    >
      <span className="relative flex size-5 items-center justify-center" aria-hidden>
        <span className="bg-primary/35 absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" />
        <span className="bg-primary/25 absolute inset-0.5 animate-pulse rounded-full motion-reduce:animate-none" />
        <span className="from-primary to-primary/60 relative size-2.5 rounded-full bg-gradient-to-br shadow-[0_0_12px_var(--primary)]" />
      </span>
      <span className="shimmer motion-reduce:animate-none">{label}</span>
      <span className="flex items-center gap-1" aria-hidden>
        {DOT_DELAYS.map((delay) => (
          <span
            key={delay}
            className="bg-primary/70 size-1 animate-bounce rounded-full motion-reduce:animate-none"
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
    </span>
  );
}
