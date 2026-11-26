"use client";

import { Dialog as D, Tabs as T, Tooltip as TT } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";

export const TooltipProvider = TT.Provider;

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 max-w-72 rounded-sm border border-rule-2 bg-paper px-2.5 py-1.5 text-xs text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

const overlay = "fixed inset-0 z-40 bg-[rgba(20,20,18,0.28)] data-[state=open]:animate-[fade_120ms_ease-out]";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            "fixed top-[8vh] left-1/2 z-50 max-h-[84vh] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto rounded-md border border-rule-2 bg-paper p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] focus:outline-none",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-rule pb-3">
            <div>
              <D.Title className="text-md font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="-mt-1 -mr-1 rounded-sm px-1.5 py-0.5 text-ink-3 hover:bg-paper-2 hover:text-ink" aria-label="Close">
              ✕
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Side drawer used by the source inspector. */
export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-rule-2 bg-paper shadow-[-8px_0_30px_rgba(0,0,0,0.10)] focus:outline-none data-[state=open]:animate-[sheet-in_160ms_ease-out]">
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
            <div className="min-w-0">
              {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
              <D.Title className="text-md font-semibold">{title}</D.Title>
              <D.Description className="sr-only">Source inspector: evidence and history for this statement.</D.Description>
            </div>
            <D.Close className="rounded-sm px-1.5 py-0.5 text-ink-3 hover:bg-paper-2 hover:text-ink" aria-label="Close source inspector">
              ✕
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Tabs({ items, defaultValue, className, label }: { items: { value: string; label: ReactNode; content: ReactNode }[]; defaultValue?: string; className?: string; label: string }) {
  return (
    <T.Root defaultValue={defaultValue ?? items[0]?.value} className={className}>
      <T.List aria-label={label} className="flex gap-4 border-b border-rule">
        {items.map((i) => (
          <T.Trigger
            key={i.value}
            value={i.value}
            className="-mb-px border-b-2 border-transparent pb-2 text-sm text-ink-3 hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
          >
            {i.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((i) => (
        <T.Content key={i.value} value={i.value} className="pt-4 focus:outline-none">
          {i.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
