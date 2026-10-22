"use client";

import { useMemo } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  Archive,
  Database,
  Globe,
  Layers,
  Mail,
  Network,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ArchitectureKind } from "@/lib/agent/tool-results";
import { ToolCard } from "./shared";

type Node = {
  id: string;
  label: string;
  kind: ArchitectureKind;
  detail?: string;
};

type Edge = { from: string; to: string; label?: string };

type Args = { nodes?: Node[]; edges?: Edge[] };

const KIND_META: Record<ArchitectureKind, { label: string; icon: LucideIcon }> = {
  app: { label: "App", icon: Server },
  database: { label: "Database", icon: Database },
  "object-storage": { label: "S3-compatible storage", icon: Archive },
  domain: { label: "Domain", icon: Globe },
  email: { label: "Email", icon: Mail },
  cache: { label: "Cache", icon: Zap },
  other: { label: "Other", icon: Layers },
};

function layerNodes(nodes: Node[], edges: Edge[]): Node[][] {
  const ids = new Set(nodes.map((node) => node.id));
  const valid = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map<string, string[]>();
  for (const edge of valid) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }

  const depth = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue = nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, (depth.get(current) ?? 0) + 1));
      const left = (remaining.get(child) ?? 0) - 1;
      remaining.set(child, left);
      if (left === 0) queue.push(child);
    }
  }

  const deepest = Math.max(0, ...depth.values());
  const columns: Node[][] = [];
  for (const node of nodes) {
    const column = depth.get(node.id) ?? deepest + 1;
    columns[column] ??= [];
    columns[column].push(node);
  }
  return columns.filter((column): column is Node[] => Array.isArray(column));
}

/** Streamed args can arrive partially; keep only nodes with an id and label. */
function usableNodes(nodes: Node[] | undefined): Node[] {
  return (nodes ?? []).filter(
    (node): node is Node =>
      typeof node?.id === "string" && typeof node.label === "string" && node.id !== "",
  );
}

const NODE_W = 190;
const NODE_H = 58;
const COL_GAP = 110;
const ROW_GAP = 26;
const PAD = 12;

const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const ArchitectureDiagramToolUI: ToolCallMessagePartComponent<Args, unknown> = ({
  args,
}) => {
  const nodes = useMemo(() => usableNodes(args.nodes), [args.nodes]);
  const edges = useMemo(() => args.edges ?? [], [args.edges]);
  const columns = useMemo(() => layerNodes(nodes, edges), [nodes, edges]);

  const layout = useMemo(() => {
    const tallest = Math.max(1, ...columns.map((column) => column.length));
    const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP;
    const width = PAD * 2 + columns.length * NODE_W + Math.max(0, columns.length - 1) * COL_GAP;
    const positions = new Map<string, { x: number; y: number }>();
    columns.forEach((column, c) => {
      const colHeight = column.length * NODE_H + (column.length - 1) * ROW_GAP;
      const top = PAD + (height - PAD * 2 - colHeight) / 2;
      column.forEach((node, r) => {
        positions.set(node.id, { x: PAD + c * (NODE_W + COL_GAP), y: top + r * (NODE_H + ROW_GAP) });
      });
    });
    return { width, height, positions };
  }, [columns]);

  const drawn = edges.filter(
    (edge) => layout.positions.has(edge.from) && layout.positions.has(edge.to),
  );
  if (nodes.length === 0) return null;

  return (
    <ToolCard
      slot="agent-architecture"
      title="Proposed architecture"
      subtitle={`${nodes.length} components, ${drawn.length} connections`}
      icon={Network}
    >
      <div className="overflow-x-auto" dir="ltr">
        <svg
          role="img"
          aria-label="Architecture diagram"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="text-foreground min-w-full"
        >
          <defs>
            <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="currentColor" className="text-muted-foreground" />
            </marker>
          </defs>
          {drawn.map((edge, index) => {
            const from = layout.positions.get(edge.from)!;
            const to = layout.positions.get(edge.to)!;
            const forward = to.x > from.x;
            const sameColumn = to.x === from.x;
            const x1 = sameColumn ? from.x + NODE_W / 2 : forward ? from.x + NODE_W : from.x;
            const y1 = sameColumn ? (to.y > from.y ? from.y + NODE_H : from.y) : from.y + NODE_H / 2;
            const x2 = sameColumn ? to.x + NODE_W / 2 : forward ? to.x : to.x + NODE_W;
            const y2 = sameColumn ? (to.y > from.y ? to.y : to.y + NODE_H) : to.y + NODE_H / 2;
            const dx = sameColumn ? 0 : (x2 - x1) / 2;
            const dy = sameColumn ? (y2 - y1) / 2 : 0;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            return (
              <g key={index}>
                <path
                  d={`M${x1} ${y1} C${x1 + dx} ${y1 + dy} ${x2 - dx} ${y2 - dy} ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-muted-foreground"
                  markerEnd="url(#arch-arrow)"
                />
                {edge.label ? (
                  <g>
                    <rect
                      x={mx - 4 - Math.min(edge.label.length, 18) * 3.1}
                      y={my - 9}
                      width={8 + Math.min(edge.label.length, 18) * 6.2}
                      height={18}
                      rx={9}
                      className="fill-background stroke-border"
                    />
                    <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
                      {trim(edge.label, 18)}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            const meta = KIND_META[node.kind] ?? KIND_META.other;
            const Icon = meta.icon;
            return (
              <g key={node.id} data-kind={node.kind} transform={`translate(${pos.x} ${pos.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={10} className="fill-background stroke-border" strokeWidth={1.25} />
                <rect x={10} y={(NODE_H - 32) / 2} width={32} height={32} rx={8} className="fill-muted" />
                <Icon x={18} y={(NODE_H - 16) / 2} width={16} height={16} className="text-muted-foreground" aria-hidden />
                <text x={52} y={24} fontSize={13} fontWeight={600} className="fill-foreground">
                  {trim(node.label, 20)}
                </text>
                <text x={52} y={42} fontSize={11} className="fill-muted-foreground">
                  {trim(node.detail ? `${meta.label} · ${node.detail}` : meta.label, 26)}
                </text>
                <title>{node.label}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </ToolCard>
  );
};
