"use client";

import { Accordion } from "radix-ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Expandable report sections (Radix Accordion, keyboard accessible). Content stays mounted so
 * in-page search finds it; a #section-id hash opens the matching section.
 */
export function Sections({ ids, defaultOpen, children }: { ids: string[]; defaultOpen: string[]; children: ReactNode }) {
  const [open, setOpen] = useState<string[]>(defaultOpen);

  const openFromHash = useCallback(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (ids.includes(id)) {
      setOpen((o) => (o.includes(id) ? o : [...o, id]));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    }
  }, [ids]);

  useEffect(() => {
    const t = setTimeout(openFromHash, 0);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, [openFromHash]);

  const all = open.length === ids.length;
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button type="button" onClick={() => setOpen(all ? [] : ids)} className="text-xs text-ink-3 hover:text-accent">
          {all ? "Collapse all sections" : "Expand all sections"}
        </button>
      </div>
      <Accordion.Root type="multiple" value={open} onValueChange={setOpen} className="border-t border-ink">
        {children}
      </Accordion.Root>
    </div>
  );
}

export function Section({ id, n, title, meta, children }: { id: string; n: number; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <Accordion.Item value={id} id={id} className="scroll-mt-20 border-b border-rule">
      <Accordion.Header asChild>
        <h2>
          <Accordion.Trigger className="group flex w-full items-baseline gap-3 py-3 text-left hover:bg-paper-2/60">
            <span className="num w-6 shrink-0 text-xs text-ink-3">{String(n).padStart(2, "0")}</span>
            <span className="text-md font-semibold">{title}</span>
            {meta && <span className="min-w-0 flex-1 truncate text-xs font-normal text-ink-3">{meta}</span>}
            <span aria-hidden="true" className="ml-auto shrink-0 text-ink-3 transition-transform duration-150 group-data-[state=open]:rotate-90">
              ›
            </span>
          </Accordion.Trigger>
        </h2>
      </Accordion.Header>
      <Accordion.Content forceMount className="pb-6 pl-9 data-[state=closed]:hidden max-sm:pl-0">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}
