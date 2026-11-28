"use client";

import { Handle, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { memo, useEffect } from "react";
import type { EntityType } from "@/lib/domain/schemas";
import { cn } from "@/lib/util/cn";
import { ENTITY_LABEL, RELATION_LABEL, edgeQualifier, isHypothesis, type Confidence, type EdgeType } from "./labels";

export interface CanvasNode {
  key: string;
  type: EntityType;
  label: string;
  sub: string | null;
  x: number;
  y: number;
  root: boolean;
  selected: boolean;
  expanded: boolean;
}
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  confidence: Confidence;
  active: boolean;
}

type EntityNodeData = { label: string; sub: string | null; entity: EntityType; root: boolean; selected: boolean; expanded: boolean };
type EntityNode = Node<EntityNodeData, "entity">;

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, top: "50%", left: "50%", transform: "translate(-50%,-50%)" };

const EntityNodeView = memo(function EntityNodeView({ data }: NodeProps<EntityNode>) {
  return (
    <div
      className={cn(
        "max-w-[210px] min-w-[120px] cursor-pointer rounded-sm border bg-paper px-2.5 py-1.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        data.root ? "border-ink border-2" : "border-rule-2",
        data.selected && "outline-2 outline-offset-2 outline-accent",
      )}
    >
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <div className="eyebrow flex items-center justify-between gap-2 text-[10px]! leading-3!">
        <span>{ENTITY_LABEL[data.entity]}</span>
        {!data.expanded && <span aria-hidden="true">+</span>}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-ink" title={data.label}>
        {data.label}
      </div>
      {data.sub && <div className="truncate text-[10px] leading-3 text-ink-3">{data.sub}</div>}
    </div>
  );
});

const nodeTypes = { entity: EntityNodeView };

function FitOnGrowth({ count }: { count: number }) {
  const rf = useReactFlow();
  const ready = useNodesInitialized();
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void rf.fitView({ padding: 0.12, duration: 250, maxZoom: 1.1 }), 80);
    return () => clearTimeout(t);
  }, [count, ready, rf]);
  return null;
}

function edgeStyle(e: CanvasEdge) {
  const dash = e.confidence === "inferred" ? "6 4" : e.confidence === "stated" ? "1.5 3" : undefined;
  return {
    stroke: e.active ? "var(--ink)" : isHypothesis(e.type) ? "var(--st-partial)" : "var(--rule-2)",
    strokeWidth: e.active ? 1.6 : 1.2,
    strokeDasharray: dash,
  };
}

function Inner({ nodes: items, edges: links, onSelectNode, onSelectEdge }: { nodes: CanvasNode[]; edges: CanvasEdge[]; onSelectNode: (key: string) => void; onSelectEdge: (id: string) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>([]);
  useEffect(() => {
    setNodes((prev) =>
      items.map((it) => {
        const p = prev.find((n) => n.id === it.key);
        return {
          ...(p ?? {}),
          id: it.key,
          type: "entity" as const,
          zIndex: 10,
          position: p?.position ?? { x: it.x, y: it.y },
          ariaLabel: `${ENTITY_LABEL[it.type]}: ${it.label}`,
          data: { label: it.label, sub: it.sub, entity: it.type, root: it.root, selected: it.selected, expanded: it.expanded },
        };
      }),
    );
  }, [items, setNodes]);

  const edges: Edge[] = links.map((e) => {
    const q = edgeQualifier(e.type, e.confidence);
    const showLabel = e.active || isHypothesis(e.type);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "straight",
      style: edgeStyle(e),
      interactionWidth: 14,
      label: showLabel ? `${RELATION_LABEL[e.type]}${q ? ` · ${q}` : ""}` : undefined,
      labelStyle: { fontSize: 10, fill: "var(--ink-2)", fontFamily: "var(--font-mono)" },
      labelBgStyle: { fill: "var(--paper)" },
      labelBgPadding: [3, 2] as [number, number],
      ariaLabel: `${RELATION_LABEL[e.type]}${q ? ` (${q})` : ""}`,
    };
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => onSelectNode(n.id)}
      onEdgeClick={(_, e) => onSelectEdge(e.id)}
      nodesConnectable={false}
      minZoom={0.2}
      maxZoom={2}
      fitView
      proOptions={{ hideAttribution: true }}
      className="bg-paper"
    >
      <FitOnGrowth count={items.length} />
    </ReactFlow>
  );
}

export default function GraphCanvas(props: { nodes: CanvasNode[]; edges: CanvasEdge[]; onSelectNode: (key: string) => void; onSelectEdge: (id: string) => void }) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
