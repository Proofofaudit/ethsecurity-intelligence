"use client";

/** Reusable AI Lab templates kept in this browser's localStorage (never sent to the server). */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { LabConfigSchema, type LabConfig } from "@/lib/skills/schema";

export const TEMPLATES_KEY = "esi.lab.templates";

const TemplateSchema = z.object({ id: z.string().max(40), savedAt: z.string().max(40), config: z.unknown() });
export interface Template {
  id: string;
  savedAt: string;
  config: LabConfig;
}

const EMPTY: Template[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Template[] } | null = null;

function read(): Template[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(TEMPLATES_KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: Template[] = EMPTY;
  if (raw) {
    try {
      const list = z.array(TemplateSchema).max(100).safeParse(JSON.parse(raw));
      // Templates that no longer match the schema (for example after an upgrade) are skipped, not deleted.
      if (list.success)
        value = list.data.flatMap((t) => {
          const c = LabConfigSchema.safeParse(t.config);
          return c.success ? [{ id: t.id, savedAt: t.savedAt, config: c.data }] : [];
        });
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

function write(list: Template[]) {
  try {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
  } catch {
    /* storage full or disabled */
  }
  cache = null;
  listeners.forEach((l) => l());
}

export function saveTemplate(config: LabConfig): Template {
  const t: Template = { id: `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString(), config };
  // A template with the same name is replaced, so saving again updates it.
  write([t, ...read().filter((x) => x.config.name !== config.name)].slice(0, 50));
  return t;
}

export function deleteTemplate(id: string) {
  write(read().filter((t) => t.id !== id));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TEMPLATES_KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTemplates(): Template[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
