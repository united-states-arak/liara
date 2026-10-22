import { useCallback, useEffect, useRef, useState } from "react";

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function useFlash(durationMs: number) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const trigger = useCallback(() => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), durationMs);
  }, [durationMs]);

  return [active, trigger] as const;
}
