"use client";

/**
 * Private, local-first workspace kept in localStorage (never sent to the server).
 * Versioned and validated with zod; unknown fields are preserved so later versions can extend it.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";

export const WORKSPACE_KEY = "esi.workspace";

export const SavedSearch = z.object({ id: z.string(), name: z.string().max(120), query: z.string().max(2000), createdAt: z.string() });
export type SavedSearch = z.infer<typeof SavedSearch>;

export const WorkspaceSchema = z
  .object({
    version: z.literal(1),
    initiatives: z.array(z.object({ id: z.string(), addedAt: z.string() })).default([]),
    searches: z.array(SavedSearch).default([]),
  })
  .passthrough();
export type Workspace = z.infer<typeof WorkspaceSchema>;

const EMPTY: Workspace = { version: 1, initiatives: [], searches: [] };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Workspace } | null = null;

function read(): Workspace {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      const parsed = WorkspaceSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

export function updateWorkspace(fn: (w: Workspace) => Workspace) {
  const next = WorkspaceSchema.parse(fn(read()));
  try {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or disabled: keep the in-memory state */
  }
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === WORKSPACE_KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleSaved(id: string) {
  updateWorkspace((w) =>
    w.initiatives.some((x) => x.id === id) ? { ...w, initiatives: w.initiatives.filter((x) => x.id !== id) } : { ...w, initiatives: [...w.initiatives, { id, addedAt: new Date().toISOString() }] },
  );
}

export function saveSearch(name: string, query: string) {
  updateWorkspace((w) => ({ ...w, searches: [{ id: `s_${Date.now().toString(36)}`, name: name.slice(0, 120), query, createdAt: new Date().toISOString() }, ...w.searches].slice(0, 50) }));
}

export function removeSearch(id: string) {
  updateWorkspace((w) => ({ ...w, searches: w.searches.filter((s) => s.id !== id) }));
}
