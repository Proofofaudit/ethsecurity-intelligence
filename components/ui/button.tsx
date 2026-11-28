import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/util/cn";
import { ArrowUpRight } from "./icons";

type Variant = "default" | "primary" | "ghost" | "quiet";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  default: "border border-rule-2 bg-paper text-ink hover:border-ink-3 hover:bg-paper-2",
  primary: "border border-accent bg-accent text-accent-ink hover:opacity-90",
  ghost: "border border-transparent text-ink-2 hover:bg-paper-2 hover:text-ink",
  quiet: "border border-transparent px-0! text-ink-3 hover:text-accent underline-offset-4 hover:underline",
};
const sizes: Record<Size, string> = { sm: "h-7 px-2 text-xs", md: "h-8 px-3 text-sm" };

export function buttonClass(variant: Variant = "default", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "default", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ href, variant = "default", size = "md", className, children, external }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; external?: boolean }) {
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-rule-2 bg-paper-2 px-1 text-[10px] leading-none text-ink-3", className)}>{children}</kbd>;
}

/** Neutral tag for official categories and other labels (never used for evidence status). */
export function Tag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-xs border border-rule px-1.5 py-px text-2xs whitespace-nowrap text-ink-2", className)}>
      {children}
    </span>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("link break-words", className)}>
      {children}
      <ArrowUpRight />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
