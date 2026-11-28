"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ExternalLink, Tag } from "@/components/ui/button";
import { FundingBar } from "@/components/ui/charts";
import { AddPicker, Check, type PickOption } from "@/components/ui/form";
import { formatDate, Money, Pct } from "@/components/ui/money";
import type { EntityType } from "@/lib/domain/schemas";
import type { entityProfile, GraphEdge, GraphNode } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";
import type { CanvasEdge, CanvasNode } from "./canvas";
import { CONFIDENCE_LABEL, ENTITY_LABEL, RELATION_LABEL, edgeQualifier, isHypothesis, splitKey, type EdgeType } from "./labels";

const GraphCanvas = dynamic(() => import("./canvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-ink-3">Loading the relationship map…</div>,
});

type Profile = NonNullable<ReturnType<typeof entityProfile>>;
type Pos = { x: number; y: number };

const MAX_NODES = 150;
const DEFAULT_HIDDEN_TYPES: EntityType[] = ["milestone"];

function ringPositions(center: Pos, count: number, from: Pos | null): Pos[] {
  if (!count) return [];
  const radius = Math.max(210, Math.min(560, count * 26));
  // Root: full circle. Expanded nodes: a half circle facing away from the root.
  const base = from ? Math.atan2(center.y - from.y, center.x - from.x) : -Math.PI / 2;
  const spread = from ? Math.PI * 1.1 : Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const t = from ? (count === 1 ? 0 : i / (count - 1) - 0.5) * spread : (i / count) * spread;
    const a = base + t;
    const r = from ? radius : radius * (count > 14 && i % 2 ? 1.28 : 1);
    return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
  });
}

interface State {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  pos: Map<string, Pos>;
  expanded: Set<string>;
}

const empty = (): State => ({ nodes: new Map(), edges: new Map(), pos: new Map(), expanded: new Set() });

export function GraphExplorer({ root, options, datasetRelationCounts }: { root: { type: EntityType; id: string; key: string } | null; options: PickOption[]; datasetRelationCounts: { type: EdgeType; count: number }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>(empty);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(root?.key ?? null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set(DEFAULT_HIDDEN_TYPES));
  const [hiddenRels, setHiddenRels] = useState<Set<EdgeType>>(new Set());
  const [showInferred, setShowInferred] = useState(true);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const expand = useCallback(async (key: string) => {
    const s = stateRef.current;
    if (s.expanded.has(key)) return;
    const { type, id } = splitKey(key);
    setLoading(key);
    setError(null);
    try {
      const qs = new URLSearchParams({ type, id, includeMilestones: "true" });
      const res = await fetch(`/api/v1/graph?${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
      const body = (await res.json()) as { data: { nodes: GraphNode[]; edges: GraphEdge[] } };
      setState((prev) => {
        const next: State = { nodes: new Map(prev.nodes), edges: new Map(prev.edges), pos: new Map(prev.pos), expanded: new Set(prev.expanded) };
        next.expanded.add(key);
        const firstKey = prev.pos.keys().next().value as string | undefined;
        const center = next.pos.get(key) ?? { x: 0, y: 0 };
        if (!next.pos.has(key)) next.pos.set(key, center);
        const self = body.data.nodes.find((n) => n.id === key);
        if (self && !next.nodes.has(key)) next.nodes.set(key, self);
        const fresh = body.data.nodes.filter((n) => !next.nodes.has(n.id)).slice(0, Math.max(0, MAX_NODES - next.nodes.size));
        const from = firstKey && firstKey !== key ? (next.pos.get(firstKey) ?? null) : null;
        const ring = ringPositions(center, fresh.length, from);
        const taken = [...next.pos.values()];
        fresh.forEach((n, i) => {
          next.nodes.set(n.id, n);
          if (next.pos.has(n.id)) return;
          const p = { ...(ring[i] ?? center) };
          const dx = p.x - center.x || 1;
          const dy = p.y - center.y;
          const len = Math.hypot(dx, dy) || 1;
          // Push outward until the node box (about 220 x 64) no longer overlaps a placed node.
          for (let k = 0; k < 30 && taken.some((q) => Math.abs(q.x - p.x) < 230 && Math.abs(q.y - p.y) < 70); k++) {
            p.x += (dx / len) * 45;
            p.y += (dy / len) * 45;
          }
          taken.push(p);
          next.pos.set(n.id, p);
        });
        for (const e of body.data.edges) if (next.nodes.has(e.source) && next.nodes.has(e.target)) next.edges.set(e.id, e);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The relationship data could not be loaded.");
    } finally {
      setLoading(null);
    }
  }, []);

  // The parent remounts this component (key = root) when the starting entity changes.
  useEffect(() => {
    if (!root) return;
    const t = setTimeout(() => void expand(root.key), 0);
    return () => clearTimeout(t);
  }, [root, expand]);

  const visibleEdges = useMemo(
    () =>
      [...state.edges.values()].filter((e) => {
        if (!showInferred && e.confidence === "inferred") return false;
        if (hiddenRels.has(e.type)) return false;
        const a = state.nodes.get(e.source);
        const b = state.nodes.get(e.target);
        if (!a || !b) return false;
        return (!hiddenTypes.has(a.type) || a.id === root?.key) && (!hiddenTypes.has(b.type) || b.id === root?.key);
      }),
    [state, showInferred, hiddenRels, hiddenTypes, root],
  );

  const visibleNodeKeys = useMemo(() => {
    const keys = new Set<string>(root ? [root.key] : []);
    for (const e of visibleEdges) {
      keys.add(e.source);
      keys.add(e.target);
    }
    return keys;
  }, [visibleEdges, root]);

  const canvasNodes: CanvasNode[] = useMemo(
    () =>
      [...visibleNodeKeys]
        .map((k) => state.nodes.get(k))
        .filter((n): n is GraphNode => !!n)
        .map((n) => ({ key: n.id, type: n.type, label: n.label, sub: n.sub, x: state.pos.get(n.id)?.x ?? 0, y: state.pos.get(n.id)?.y ?? 0, root: n.id === root?.key, selected: n.id === selected, expanded: state.expanded.has(n.id) })),
    [visibleNodeKeys, state, root, selected],
  );
  const canvasEdges: CanvasEdge[] = useMemo(
    () => visibleEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, confidence: e.confidence, active: e.id === selectedEdge || e.source === selected || e.target === selected })),
    [visibleEdges, selected, selectedEdge],
  );

  const typesPresent = useMemo(() => {
    const m = new Map<EntityType, number>();
    for (const n of state.nodes.values()) if (n.id !== root?.key) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => ENTITY_LABEL[a[0]].localeCompare(ENTITY_LABEL[b[0]]));
  }, [state, root]);
  const relsPresent = useMemo(() => {
    const m = new Map<EdgeType, number>();
    for (const e of state.edges.values()) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => RELATION_LABEL[a[0]].localeCompare(RELATION_LABEL[b[0]]));
  }, [state]);

  const selectNode = useCallback(
    (key: string) => {
      setSelected(key);
      setSelectedEdge(null);
      void expand(key);
    },
    [expand],
  );
  const selectEdge = useCallback((id: string) => {
    setSelectedEdge(id);
  }, []);

  const recenter = (key: string) => {
    const { type, id } = splitKey(key);
    router.push(`${pathname}?type=${type}&id=${encodeURIComponent(id)}`, { scroll: false });
  };

  const toggleSet = <T,>(set: Set<T>, v: T, on: boolean) => {
    const n = new Set(set);
    if (on) n.delete(v);
    else n.add(v);
    return n;
  };

  const edge = selectedEdge ? state.edges.get(selectedEdge) : undefined;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr] md:items-end">
        <div>
          <p className="mb-1 text-xs text-ink-3">Start from any initiative, organization, backer, repository, standard, contributor or security problem</p>
          <AddPicker options={options} selected={root ? [root.key] : []} max={2} onAdd={recenter} placeholder="Type a name, for example ERC-7730 or Signing" label="Choose the entity to start from" />
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-2" aria-label="Line styles">
          <li className="flex items-center gap-2">
            <svg width="28" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="28" y2="3" stroke="var(--ink-2)" strokeWidth="1.4" />
            </svg>
            Confirmed (official or observed evidence)
          </li>
          <li className="flex items-center gap-2">
            <svg width="28" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="28" y2="3" stroke="var(--ink-2)" strokeWidth="1.4" strokeDasharray="1.5 3" />
            </svg>
            Stated in the proposal
          </li>
          <li className="flex items-center gap-2">
            <svg width="28" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="28" y2="3" stroke="var(--st-partial)" strokeWidth="1.4" strokeDasharray="6 4" />
            </svg>
            Inferred: rule-based or hypothesis, not confirmed
          </li>
        </ul>
      </div>

      {!root ? null : (
        <>
          <div className="grid gap-x-8 gap-y-3 border-y border-rule py-3 lg:grid-cols-[auto_1fr_1fr]">
            <Check checked={showInferred} onChange={setShowInferred}>
              Include inferred relationships
            </Check>
            <fieldset className="min-w-0">
              <legend className="eyebrow mb-1">Entity types</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {typesPresent.length === 0 && <span className="text-xs text-ink-3">None loaded yet</span>}
                {typesPresent.map(([t, n]) => (
                  <Check key={t} checked={!hiddenTypes.has(t)} onChange={(on) => setHiddenTypes((s) => toggleSet(s, t, on))} className="text-xs">
                    {ENTITY_LABEL[t]} <span className="num text-ink-3">{n}</span>
                  </Check>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="eyebrow mb-1">Relationship types</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {relsPresent.map(([t, n]) => (
                  <Check key={t} checked={!hiddenRels.has(t)} onChange={(on) => setHiddenRels((s) => toggleSet(s, t, on))} className="text-xs">
                    {RELATION_LABEL[t]} <span className="num text-ink-3">{n}</span>
                  </Check>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="relative h-[620px] overflow-hidden rounded-sm border border-rule-2 max-md:h-[460px]" aria-label="Relationship map (the same data is listed below)">
              <GraphCanvas nodes={canvasNodes} edges={canvasEdges} onSelectNode={selectNode} onSelectEdge={selectEdge} />
              {loading && (
                <p role="status" className="absolute right-2 bottom-2 rounded-xs bg-paper px-2 py-1 text-2xs text-ink-3">
                  Loading connections…
                </p>
              )}
            </div>
            <p className="text-2xs text-ink-3 lg:col-start-1 lg:row-start-2">
              <span className="num">{canvasNodes.length}</span> entities and <span className="num">{canvasEdges.length}</span> relationships shown
              {state.nodes.size >= MAX_NODES ? `, limit of ${MAX_NODES} reached` : ""}. Click an entity to see its profile and expand its connections; entities marked + are not expanded yet. Drag to pan, scroll or pinch to zoom.
            </p>
            <aside aria-label="Selected entity" className="min-w-0 overflow-x-hidden border-t border-ink pt-3 lg:row-span-2 lg:row-start-1 lg:col-start-2 lg:max-h-[640px] lg:overflow-y-auto">
              {error && (
                <p role="alert" className="mb-3 text-xs text-st-contradicted">
                  {error}
                </p>
              )}
              {edge ? (
                <EdgePanel edge={edge} nodes={state.nodes} onSelect={selectNode} onClose={() => setSelectedEdge(null)} />
              ) : selected ? (
                <ProfilePanel key={selected} nodeKey={selected} state={state} rootKey={root.key} onSelect={selectNode} onRecenter={recenter} onSelectEdge={selectEdge} />
              ) : null}
            </aside>
          </div>

          <NeighborhoodList state={state} edges={visibleEdges} onSelect={selectNode} onSelectEdge={selectEdge} />
        </>
      )}

      <p className="text-xs text-ink-3">
        Relationship types in the whole dataset:{" "}
        {datasetRelationCounts.map((r, i) => (
          <span key={r.type}>
            {i > 0 && " · "}
            {RELATION_LABEL[r.type]} <span className="num">{r.count}</span>
          </span>
        ))}
        . Integration statements are recorded as applicant claims in each dossier, not as confirmed relationships.
      </p>
    </div>
  );
}

function EdgeLine({ e, nodes, onSelect }: { e: GraphEdge; nodes: Map<string, GraphNode>; onSelect: (k: string) => void }) {
  const a = nodes.get(e.source);
  const b = nodes.get(e.target);
  const q = edgeQualifier(e.type, e.confidence);
  const same = !!a && !!b && a.label === b.label;
  const tag = (n: GraphNode | undefined) => (same && n ? <span className="text-2xs text-ink-3"> ({ENTITY_LABEL[n.type].toLowerCase()})</span> : null);
  return (
    <span className="min-w-0">
      <button type="button" className="font-medium hover:text-accent" onClick={() => onSelect(e.source)}>
        {a?.label ?? e.source}
      </button>
      {tag(a)}{" "}
      <span className="text-ink-3">{RELATION_LABEL[e.type]}</span>{" "}
      <button type="button" className="font-medium hover:text-accent" onClick={() => onSelect(e.target)}>
        {b?.label ?? e.target}
      </button>
      {tag(b)}
      {q && <span className={cn("ml-2 text-2xs", isHypothesis(e.type) ? "text-st-partial" : "text-ink-3")}>{q}</span>}
    </span>
  );
}

function EdgePanel({ edge, nodes, onSelect, onClose }: { edge: GraphEdge; nodes: Map<string, GraphNode>; onSelect: (k: string) => void; onClose: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{isHypothesis(edge.type) ? "Research hypothesis" : "Relationship"}</p>
        <button type="button" onClick={onClose} className="text-xs text-ink-3 hover:text-accent">
          Back to entity
        </button>
      </div>
      <p>
        <EdgeLine e={edge} nodes={nodes} onSelect={onSelect} />
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-3">Basis</dt>
        <dd>{CONFIDENCE_LABEL[edge.confidence]}</dd>
        <dt className="text-ink-3">Reason</dt>
        <dd>{edge.reason}</dd>
      </dl>
      {isHypothesis(edge.type) && <p className="border-l-2 border-st-partial pl-3 text-xs text-ink-2">A hypothesis from text similarity and shared signals. It does not mean the initiatives duplicate each other or work together.</p>}
      <EvidenceLinks urls={edge.sourceUrls} />
    </div>
  );
}

function EvidenceLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return <p className="text-xs text-ink-3">No source document is attached to this relationship; it is derived from the published dataset.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {[...new Set(urls)].slice(0, 6).map((u) => (
        <li key={u} className="min-w-0 break-all">
          <ExternalLink href={u} className="break-all">{u.replace(/^https?:\/\//, "")}</ExternalLink>
        </li>
      ))}
    </ul>
  );
}

function ProfilePanel({ nodeKey, state, rootKey, onSelect, onRecenter, onSelectEdge }: { nodeKey: string; state: State; rootKey: string; onSelect: (k: string) => void; onRecenter: (k: string) => void; onSelectEdge: (id: string) => void }) {
  const node = state.nodes.get(nodeKey);
  const { type, id } = splitKey(nodeKey);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/entities/${type}/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { data: Profile }) => live && setProfile(b.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [type, id]);

  const touching = [...state.edges.values()].filter((e) => e.source === nodeKey || e.target === nodeKey);
  const connectedInitiatives = [...new Set(touching.map((e) => (e.source === nodeKey ? e.target : e.source)).filter((k) => k.startsWith("initiative:")))].map((k) => state.nodes.get(k)).filter((n): n is GraphNode => !!n);
  const sources = [...new Set(touching.flatMap((e) => e.sourceUrls))];

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="eyebrow">{ENTITY_LABEL[type]}</p>
        <h2 className="mt-0.5 text-md font-semibold">{node?.label ?? id}</h2>
        {node?.sub && <p className="text-xs text-ink-3">{node.sub}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {nodeKey !== rootKey && (
            <Button size="sm" onClick={() => onRecenter(nodeKey)}>
              Start the map here
            </Button>
          )}
          <EntityLink type={type} id={id} slug={profile && profile.type === "initiative" && "initiative" in profile ? profile.initiative.slug : undefined} />
        </div>
      </div>
      {failed ? <p className="text-xs text-ink-3">The profile could not be loaded.</p> : !profile ? <p className="text-xs text-ink-3">Loading profile…</p> : <ProfileBody p={profile} />}
      <div className="border-t border-rule pt-3">
        <p className="eyebrow mb-1.5">Connected initiatives ({connectedInitiatives.length})</p>
        {connectedInitiatives.length ? (
          <ul className="space-y-1 text-xs">
            {connectedInitiatives.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSelect(n.id)} className="hover:text-accent">
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">None among the loaded connections.</p>
        )}
      </div>
      <div className="border-t border-rule pt-3">
        <p className="eyebrow mb-1.5">Relationships and their basis</p>
        <ul className="space-y-1.5 text-xs">
          {touching.slice(0, 40).map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-2">
              <EdgeLine e={e} nodes={state.nodes} onSelect={onSelect} />
              <button type="button" onClick={() => onSelectEdge(e.id)} className="shrink-0 text-ink-3 hover:text-accent">
                Basis
              </button>
            </li>
          ))}
        </ul>
        {touching.length > 40 && <p className="mt-1 text-2xs text-ink-3">{touching.length - 40} more are listed in the table below the map.</p>}
      </div>
      <div className="border-t border-rule pt-3">
        <p className="eyebrow mb-1.5">Source evidence</p>
        <EvidenceLinks urls={sources} />
      </div>
    </div>
  );
}

function EntityLink({ type, id, slug }: { type: EntityType; id: string; slug?: string }) {
  if (type === "initiative")
    return !slug ? null : (
      <Link href={`/initiatives/${slug}`} className="inline-flex h-7 items-center rounded-sm border border-rule-2 px-2 text-xs hover:border-ink-3">
        Open dossier
      </Link>
    );
  if (["organization", "repository", "person", "standard", "problem", "product"].includes(type))
    return (
      <Link href={`/entities/${type}/${encodeURIComponent(id)}`} className="inline-flex h-7 items-center rounded-sm border border-rule-2 px-2 text-xs hover:border-ink-3">
        Full profile
      </Link>
    );
  return null;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function ProfileBody({ p }: { p: Profile }) {
  const dl = "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs";
  if ("initiative" in p && p.type === "initiative") {
    const i = p.initiative;
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-2">{i.title}</p>
        <FundingBar f={i} height={6} />
        <dl className={dl}>
          <Row k="Goal">
            <Money cents={i.goalCents} />
          </Row>
          <Row k="Raised">
            <Money cents={i.raisedCents} /> (<Pct value={i.pct} />)
          </Row>
          <Row k="TheDAO ask">
            <Money cents={i.theDaoAskCents} reason="Goal or raised unavailable" />
          </Row>
          <Row k="Recipient">{i.organization ?? i.recipientTeam ?? "No designated recipient (RFP)"}</Row>
          <Row k="Milestones">
            <span className="num">{i.milestones}</span>, of which <span className="num">{i.adoptionMilestones}</span> adoption
          </Row>
          <Row k="Supported claims">
            <span className="num">
              {i.supportedClaims} of {i.claimCount}
            </span>
          </Row>
        </dl>
        <div className="flex flex-wrap gap-1">
          {i.categories.map((c) => (
            <Tag key={c.slug}>{c.label}</Tag>
          ))}
        </div>
      </div>
    );
  }
  if (p.type === "organization" && "organization" in p) {
    const o = p.organization;
    return (
      <div className="space-y-3">
        <dl className={dl}>
          <Row k="Role">{o.kind === "both" ? "Recipient and backer" : o.kind === "recipient" ? "Recipient" : o.kind === "backer" ? "Backer" : "Related"}</Row>
          {o.names.length > 1 && <Row k="Official spellings">{o.names.join(" · ")}</Row>}
          {o.website && (
            <Row k="Website">
              <ExternalLink href={o.website}>{o.website.replace(/^https?:\/\//, "")}</ExternalLink>
            </Row>
          )}
          {o.githubProfile && (
            <Row k="GitHub">
              <ExternalLink href={o.githubProfile.url}>{o.githubProfile.login}</ExternalLink>
            </Row>
          )}
          <Row k="Proposes">{p.proposes.length ? p.proposes.map((x) => x.shortTitle).join(", ") : "None"}</Row>
          <Row k="Pledge records">
            <span className="num">{p.pledges.length}</span>
          </Row>
        </dl>
        {o.anonymous && <p className="text-xs text-ink-3">Anonymous or individual label. It is never merged with other pledges.</p>}
        {p.aliases.some((a) => a.resolution === "candidate_unconfirmed") && <p className="text-xs text-st-partial">A similar name exists in the data. It is not confirmed as the same entity.</p>}
      </div>
    );
  }
  if (p.type === "repository" && "repository" in p) {
    const r = p.repository;
    return (
      <dl className={dl}>
        <Row k="Repository">
          <ExternalLink href={r.url}>{r.fullName}</ExternalLink>
        </Row>
        {r.description && <Row k="Description">{r.description}</Row>}
        <Row k="Public">{r.exists ? "Yes" : "Not found"}</Row>
        {r.language && <Row k="Language">{r.language}</Row>}
        {r.license && <Row k="License">{r.license}</Row>}
        <Row k="Last push">{formatDate(r.pushedAt)}</Row>
        <Row k="Commits, 90 days">{r.commitsLast90d === null ? "Unknown" : <span className="num">{r.commitsLast90d}</span>}</Row>
        <Row k="Checked">{formatDate(r.checkedAt)}</Row>
      </dl>
    );
  }
  if (p.type === "person" && "person" in p) {
    return (
      <dl className={dl}>
        {p.person.role && <Row k="Role">{p.person.role}</Row>}
        <Row k="Public profiles">
          {p.person.publicProfiles.length
            ? p.person.publicProfiles.map((u) => (
                <span key={u} className="block truncate">
                  <ExternalLink href={u}>{u.replace(/^https?:\/\//, "")}</ExternalLink>
                </span>
              ))
            : "None recorded"}
        </Row>
      </dl>
    );
  }
  if (p.type === "problem" && "stage" in p) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-ink-2">{p.stage.description}</p>
        <p>
          <span className="num">{p.stage.totalCount}</span> cohort initiatives map to this stage (rule-based), <span className="num">{p.stage.primaryCount}</span> as their primary stage.
        </p>
        <Link href={`/initiatives#coverage`} className="link">
          Open in the coverage map
        </Link>
      </div>
    );
  }
  if (p.type === "standard" && "standard" in p) {
    return (
      <div className="space-y-2 text-xs">
        <p>
          Referenced by <span className="num">{p.initiatives.length}</span> cohort {p.initiatives.length === 1 ? "initiative" : "initiatives"}.
        </p>
        {p.url && <ExternalLink href={p.url}>Specification on eips.ethereum.org</ExternalLink>}
      </div>
    );
  }
  if (p.type === "product" && "product" in p) {
    const x = p.product;
    return (
      <dl className={dl}>
        <Row k="Address">
          <ExternalLink href={x.url}>{x.url.replace(/^https?:\/\//, "")}</ExternalLink>
        </Row>
        <Row k="Reachable">{x.reachable === null ? "Not checked" : x.reachable ? `Yes (HTTP ${x.status})` : `No${x.status ? ` (HTTP ${x.status})` : ""}`}</Row>
        <Row k="Checked">{formatDate(x.checkedAt)}</Row>
      </dl>
    );
  }
  if (p.type === "milestone" && "milestone" in p) {
    const m = p.milestone;
    return (
      <dl className={dl}>
        <Row k="Initiative">{p.initiative}</Row>
        <Row k="Budget">
          <Money cents={m.amountCents} />
        </Row>
        <Row k="Type">{m.adoption ? "Adoption milestone" : "Delivery milestone"}</Row>
        <Row k="Status">{m.done ? "Marked complete" : "Not complete"}</Row>
        <Row k="Criteria">{m.criteria.join(" ") || "None recorded"}</Row>
      </dl>
    );
  }
  return null;
}

function NeighborhoodList({ state, edges, onSelect, onSelectEdge }: { state: State; edges: GraphEdge[]; onSelect: (k: string) => void; onSelectEdge: (id: string) => void }) {
  const groups = new Map<EdgeType, GraphEdge[]>();
  for (const e of edges) groups.set(e.type, [...(groups.get(e.type) ?? []), e]);
  const sorted = [...groups.entries()].sort((a, b) => RELATION_LABEL[a[0]].localeCompare(RELATION_LABEL[b[0]]));
  return (
    <details className="group border-t border-ink pt-3" open>
      <summary className="flex items-baseline justify-between gap-4">
        <h2 className="text-md font-semibold">The same relationships as a list</h2>
        <span className="text-xs text-ink-3 group-open:hidden">Show</span>
        <span className="hidden text-xs text-ink-3 group-open:inline">Hide</span>
      </summary>
      <p className="mt-1 mb-3 text-xs text-ink-3">Keyboard accessible. Selecting an entity name opens its profile and expands its connections, exactly like clicking it on the map.</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-ink-3">No relationships match the current filters.</p>
      ) : (
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {sorted.map(([t, list]) => (
            <section key={t} className="min-w-0">
              <h3 className="eyebrow mb-1">
                {RELATION_LABEL[t]} <span className="num">({list.length})</span>
                {isHypothesis(t) && " · research hypotheses"}
              </h3>
              <ul className="divide-y divide-rule text-sm">
                {list.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <EdgeLine e={e} nodes={state.nodes} onSelect={onSelect} />
                    <button type="button" onClick={() => onSelectEdge(e.id)} className="shrink-0 text-xs text-ink-3 hover:text-accent">
                      Basis
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </details>
  );
}
