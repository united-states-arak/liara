"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FC,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { renderMermaidSVG } from "beautiful-mermaid";
import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

const INVALID_SVG = /^<svg\b[^>]*\swidth="0"/;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** Draws the source as an SVG image. Returns null when mermaid cannot draw it. */
function drawDiagram(code: string): string | null {
  try {
    const svg = renderMermaidSVG(code);
    if (INVALID_SVG.test(svg)) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

function DiagramSource({ code, note }: { code: string; note: string }) {
  return (
    <div data-slot="agent-mermaid-source" className="my-3 overflow-hidden rounded-xl border">
      <p className="text-muted-foreground bg-muted/50 border-b px-3 py-1.5 text-xs">{note}</p>
      <pre className="bg-muted/30 overflow-x-auto p-3 font-mono text-xs leading-5">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type View = { x: number; y: number; scale: number };

const START_VIEW: View = { x: 0, y: 0, scale: 1 };

function DiagramDialog({ src, onClose }: { src: string; onClose: () => void }) {
  const [view, setView] = useState<View>(START_VIEW);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const zoom = useCallback((factor: number) => {
    setView((current) => ({
      ...current,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)),
    }));
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = drag.current;
    if (!origin) return;
    setView((current) => ({
      ...current,
      x: origin.originX + event.clientX - origin.startX,
      y: origin.originY + event.clientY - origin.startY,
    }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    zoom(Math.exp(-event.deltaY * 0.0015));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Diagram"
      className="bg-background/95 fade-in animate-in fixed inset-0 z-50 duration-200 motion-reduce:animate-none"
    >
      <div
        className="h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={src}
            alt="Diagram, enlarged"
            draggable={false}
            className="max-h-[80vh] max-w-[90vw] rounded-xl bg-white p-4 select-none"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          />
        </div>
      </div>
      <div className="border-border bg-background absolute top-4 end-4 flex items-center gap-1 rounded-lg border p-1">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoom(1.25)}
          className="text-muted-foreground hover:text-foreground rounded-sm p-1.5"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
          className="text-muted-foreground hover:text-foreground rounded-sm p-1.5"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={() => setView(START_VIEW)}
          className="text-muted-foreground hover:text-foreground rounded-sm p-1.5"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close diagram"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground rounded-sm p-1.5"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function MermaidBlockImpl({ code }: SyntaxHighlighterProps) {
  const streaming = useAuiState((s) => s.optional.part?.status.type === "running");
  const mounted = useSyncExternalStore(subscribeNothing, onClient, onServer);
  const src = useMemo(
    () => (streaming || !mounted ? null : drawDiagram(code)),
    [code, streaming, mounted],
  );
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setExpanded(false);
    triggerRef.current?.focus();
  }, []);

  if (src === null) {
    const note = streaming
      ? "Diagram appears when the answer finishes."
      : mounted
        ? "Diagram could not be drawn. Showing the source."
        : "Drawing diagram…";
    return <DiagramSource code={code} note={note} />;
  }

  return (
    <div
      data-slot="agent-mermaid-diagram"
      className="group/diagram relative my-3 rounded-xl border bg-white p-3"
    >
      <img src={src} alt="Diagram" className="mx-auto block h-auto max-w-full" />
      <button
        ref={triggerRef}
        type="button"
        aria-label="Expand diagram"
        onClick={() => setExpanded(true)}
        className="text-muted-foreground hover:text-foreground border-border bg-background absolute top-2 end-2 rounded-md border p-1.5 opacity-100 transition md:opacity-0 md:group-hover/diagram:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <Maximize2 className="size-3.5" aria-hidden />
      </button>
      {expanded ? <DiagramDialog src={src} onClose={close} /> : null}
    </div>
  );
}

export const MermaidBlock = memo(MermaidBlockImpl) as FC<SyntaxHighlighterProps>;
