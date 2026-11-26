"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EvidenceStatus } from "@/lib/domain/schemas";
import { StatusMark } from "@/components/ui/status";
import { Kbd } from "@/components/ui/button";
import { ADVANCED_VIEWS, PRIMARY_NAV, REFERENCE_PAGES, type PageItem } from "./nav";
import { setTheme } from "./theme";

export interface PaletteInitiative {
  slug: string;
  title: string;
  shortTitle: string;
  organization: string | null;
  type: "grant" | "rfp";
  keywords: string;
}
export interface PaletteOrganization {
  id: string;
  name: string;
  role: string;
}
interface ClaimHit {
  id: string;
  initiativeSlug: string;
  initiative: string;
  assertion: string;
  status: EvidenceStatus;
}

const PaletteCtx = createContext<{ open: () => void }>({ open: () => {} });
export const usePalette = () => useContext(PaletteCtx);

const match = (q: string, text: string) => {
  const hay = text.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
};

export function CommandPaletteProvider({ initiatives, organizations, children }: { initiatives: PaletteInitiative[]; organizations: PaletteOrganization[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [claims, setClaims] = useState<ClaimHit[]>([]);
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const query = q.trim();
    const id = ++seq.current;
    if (query.length < 3) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/claims?q=${encodeURIComponent(query)}&limit=8`);
        if (!res.ok) return;
        const body = (await res.json()) as { data: { items: ClaimHit[] } };
        if (id === seq.current) setClaims(body.data.items);
      } catch {
        /* offline: claim results are optional */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      router.push(href);
    },
    [router],
  );

  const query = q.trim();
  const shownClaims = query.length < 3 ? [] : claims;
  const ini = useMemo(() => (query ? initiatives.filter((i) => match(query, `${i.title} ${i.shortTitle} ${i.organization ?? ""} ${i.keywords}`)).slice(0, 8) : []), [initiatives, query]);
  const orgs = useMemo(() => (query ? organizations.filter((o) => match(query, o.name)).slice(0, 5) : []), [organizations, query]);
  const pages = (list: PageItem[]) => (query ? list.filter((p) => match(query, `${p.label} ${p.hint} ${p.keywords ?? ""}`)) : list);

  const item = "flex cursor-pointer items-baseline gap-3 rounded-sm px-2.5 py-2 text-sm aria-selected:bg-paper-2 aria-selected:text-ink";
  const group = "px-1 pb-1 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1";
  const pageGroup = (heading: string, list: PageItem[]) =>
    list.length > 0 && (
      <Command.Group heading={heading} className={group}>
        {list.map((p) => (
          <Command.Item key={p.href} value={`page:${p.href}`} onSelect={() => go(p.href)} className={item}>
            <span className="text-ink">{p.label}</span>
            <span className="truncate text-xs text-ink-3">{p.hint}</span>
          </Command.Item>
        ))}
      </Command.Group>
    );

  return (
    <PaletteCtx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <Command.Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
        label="Command palette"
        shouldFilter={false}
        loop
        overlayClassName="fixed inset-0 z-40 bg-[rgba(20,20,18,0.28)]"
        contentClassName="fixed top-[10vh] left-1/2 z-50 w-[min(680px,calc(100vw-20px))] -translate-x-1/2 overflow-hidden rounded-md border border-rule-2 bg-paper shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
      >
        <div className="flex items-center gap-2 border-b border-rule px-3.5">
          <SearchIcon />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Search initiatives, organizations, claims and pages"
            className="h-12 w-full bg-transparent text-md text-ink outline-none placeholder:text-ink-3"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[min(62vh,520px)] overflow-y-auto pb-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-ink-3">No matches in initiatives, organizations, claims or pages.</Command.Empty>
          {ini.length > 0 && (
            <Command.Group heading="Initiatives" className={group}>
              {ini.map((i) => (
                <Command.Item key={i.slug} value={`ini:${i.slug}`} onSelect={() => go(`/initiatives/${i.slug}`)} className={item}>
                  <span className="min-w-0 truncate text-ink">{i.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-3">
                    {i.organization ?? "No designated recipient"} · {i.type === "rfp" ? "RFP" : "Grant"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {orgs.length > 0 && (
            <Command.Group heading="Organizations" className={group}>
              {orgs.map((o) => (
                <Command.Item key={o.id} value={`org:${o.id}`} onSelect={() => go(`/entities/organization/${encodeURIComponent(o.id)}`)} className={item}>
                  <span className="text-ink">{o.name}</span>
                  <span className="text-xs text-ink-3">{o.role}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {shownClaims.length > 0 && (
            <Command.Group heading="Claims" className={group}>
              {shownClaims.map((c) => (
                <Command.Item key={c.id} value={`claim:${c.id}`} onSelect={() => go(`/initiatives/${c.initiativeSlug}#claim=${c.id}`)} className={`${item} flex-col gap-1`}>
                  <span className="line-clamp-2 text-ink">{c.assertion}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-3">
                    <StatusMark status={c.status} />
                    <span>{c.initiative}</span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {pageGroup("Go to", pages(PRIMARY_NAV))}
          {pageGroup("Advanced views", pages(ADVANCED_VIEWS))}
          {pageGroup("Reference", pages(REFERENCE_PAGES))}
          {(!query || match(query, "theme dark light mode")) && (
            <Command.Group heading="Preferences" className={group}>
              {(["light", "dark", "system"] as const).map((t) => (
                <Command.Item
                  key={t}
                  value={`theme:${t}`}
                  onSelect={() => {
                    setTheme(t);
                    setOpen(false);
                  }}
                  className={item}
                >
                  <span className="text-ink">Theme: {t === "system" ? "match system" : t}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-rule px-3.5 py-2 text-2xs text-ink-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="ml-auto">Claims are searched after three characters.</span>
        </div>
      </Command.Dialog>
    </PaletteCtx.Provider>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={className ?? "shrink-0 text-ink-3"}>
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PaletteButton() {
  const { open } = usePalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search (Command or Control + K)"
      className="flex h-8 items-center gap-2 rounded-sm border border-rule-2 bg-paper px-2.5 text-sm text-ink-3 hover:border-ink-3 hover:text-ink md:w-64"
    >
      <SearchIcon />
      <span className="max-md:sr-only">Search</span>
      <span className="ml-auto flex items-center gap-0.5 max-md:hidden">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
