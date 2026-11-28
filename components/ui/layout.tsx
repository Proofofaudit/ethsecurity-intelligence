import Link from "next/link";
import { ArrowRight } from "./icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";

export function PageHead({ eyebrow, title, lede, aside, className, as: H = "h1" }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; aside?: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4", className)}>
      <div className="max-w-[760px] min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <H className="text-[28px] leading-[34px] font-semibold tracking-[-0.015em] max-sm:text-[23px] max-sm:leading-[29px]">{title}</H>
        {lede && <div className="mt-3 text-md text-ink-2">{lede}</div>}
      </div>
      {aside}
    </header>
  );
}

/** Report section heading: a heavy top rule, title, optional note and action link. */
export function Block({ title, note, href, hrefLabel, children, className, id }: { title: string; note?: ReactNode; href?: string; hrefLabel?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn("border-t border-ink pt-3", className)} aria-labelledby={id ? `${id}-h` : undefined} id={id}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id ? `${id}-h` : undefined} className="text-md font-semibold">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-ink-3 hover:text-accent">
            {hrefLabel ?? "Open"} <ArrowRight />
          </Link>
        )}
      </div>
      {note && <div className="mb-3 text-xs text-ink-3">{note}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-[22px] leading-7 font-medium tracking-[-0.01em] max-sm:text-[19px]">{value}</dd>
      {sub && <dd className="mt-1 text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-ink-3", className)}>{children}</p>;
}
