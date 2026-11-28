"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { selectClass } from "@/components/ui/form";
import type { CheckQuestion } from "@/lib/intelligence/questions-to-check";

/** The merged "Questions to check" list: filter by initiative or by kind, alphabetical by initiative. */
export function QuestionsList({ items, initialInitiative = "" }: { items: CheckQuestion[]; initialInitiative?: string }) {
  const [ini, setIni] = useState(initialInitiative);
  const [kind, setKind] = useState("");
  const initiatives = useMemo(() => [...new Map(items.map((q) => [q.slug, q.initiative])).entries()], [items]);
  const kinds = useMemo(() => [...new Set(items.map((q) => q.kind))].sort(), [items]);
  const shown = items.filter((q) => (!ini || q.slug === ini) && (!kind || q.kind === kind));
  const groups = new Map<string, { slug: string; list: CheckQuestion[] }>();
  for (const q of shown) {
    const g = groups.get(q.initiative) ?? { slug: q.slug, list: [] };
    g.list.push(q);
    groups.set(q.initiative, g);
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px]">
          <span className="mb-1 block text-xs text-ink-3">Initiative</span>
          <select className={selectClass} value={ini} onChange={(e) => setIni(e.target.value)}>
            <option value="">All initiatives</option>
            {initiatives.map(([slug, label]) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[220px]">
          <span className="mb-1 block text-xs text-ink-3">Kind of question</span>
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-1.5 text-sm" aria-live="polite">
          <span className="num">{shown.length}</span> questions
        </p>
      </div>
      {groups.size === 0 ? (
        <p className="text-sm text-ink-3">No questions match these filters.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule" data-testid="questions-to-check">
          {[...groups.entries()].map(([name, g]) => (
            <li key={g.slug}>
              <details open={!!ini} className="py-2">
                <summary className="flex cursor-pointer items-baseline justify-between gap-3 text-sm font-medium">
                  <span>{name}</span>
                  <span className="num text-xs font-normal text-ink-3">{g.list.length}</span>
                </summary>
                <ul className="mt-2 space-y-2 pl-1 text-sm">
                  {g.list.map((q) => (
                    <li key={q.id}>
                      <p>{q.question}</p>
                      <p className="text-xs text-ink-3">
                        {q.kind}
                        {q.context ? ` · ${q.context}` : ""} ·{" "}
                        <Link href={`/initiatives/${q.slug}#${q.anchor}`} className="link">
                          Open the dossier
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
