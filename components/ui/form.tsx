"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/util/cn";

export const inputClass = "h-8 w-full min-w-0 rounded-xs border border-rule-2 bg-paper px-2 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";
export const selectClass = "h-8 w-full rounded-xs border border-rule-2 bg-paper px-1.5 text-sm text-ink focus:border-ink focus:outline-none";
export const textareaClass = "w-full min-w-0 rounded-xs border border-rule-2 bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export function Check({ checked, onChange, children, className, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-sm", disabled && "cursor-default opacity-50", className)}>
      <input type="checkbox" className="mt-[3px] size-3.5 shrink-0 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** Segmented single choice (radio group styled as a compact switch). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-sm border border-rule-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-6 rounded-xs px-2 text-xs whitespace-nowrap", value === o.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface PickOption {
  id: string;
  label: string;
  sub?: string | null;
  keywords?: string;
}

/** Search-as-you-type picker that adds items to a list (keyboard accessible: type, arrow keys, Enter). */
export function AddPicker({ options, selected, onAdd, max, placeholder, label }: { options: PickOption[]; selected: string[]; onAdd: (id: string) => void; max: number; placeholder: string; label: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const full = selected.length >= max;
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return options.filter((o) => !selected.includes(o.id) && `${o.label} ${o.sub ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, options, selected]);
  const pick = (o: PickOption | undefined) => {
    if (!o) return;
    onAdd(o.id);
    setQ("");
    setActive(0);
  };
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={hits[active] ? `${id}-${hits[active].id}` : undefined}
        disabled={full}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") setQ("");
        }}
        placeholder={full ? `Maximum of ${max} reached` : placeholder}
        className={inputClass}
      />
      {hits.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-sm border border-rule-2 bg-paper py-1 shadow-[0_6px_20px_rgba(0,0,0,0.10)]">
          {hits.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-${o.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-baseline justify-between gap-3 px-2.5 py-1.5 text-sm", i === active && "bg-paper-2")}
            >
              <span className="truncate">{o.label}</span>
              {o.sub && <span className="shrink-0 truncate text-xs text-ink-3">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
