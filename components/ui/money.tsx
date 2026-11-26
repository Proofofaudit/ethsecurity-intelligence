import { formatPct, formatUsd } from "@/lib/util/money";
import { cn } from "@/lib/util/cn";

/** US dollar amount from integer cents, in tabular figures. Null renders an explicit reason. */
export function Money({ cents, compact, className, reason }: { cents: number | null | undefined; compact?: boolean; className?: string; reason?: string }) {
  if (cents === null || cents === undefined) return <NotAvailable reason={reason} className={className} />;
  return (
    <span className={cn("num", className)} title={compact ? formatUsd(cents) : undefined}>
      {formatUsd(cents, { compact })}
    </span>
  );
}

export function Pct({ value, digits = 1, className, reason }: { value: number | null | undefined; digits?: number; className?: string; reason?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <NotAvailable reason={reason} className={className} />;
  return <span className={cn("num", className)}>{formatPct(value, digits)}</span>;
}

export function Num({ value, className, reason }: { value: number | null | undefined; className?: string; reason?: string }) {
  if (value === null || value === undefined) return <NotAvailable reason={reason} className={className} />;
  return <span className={cn("num", className)}>{value.toLocaleString("en-US")}</span>;
}

export function NotAvailable({ reason, className }: { reason?: string; className?: string }) {
  return (
    <span className={cn("text-ink-3 italic", className)} title={reason ?? "Not available"}>
      Not available{reason ? <span className="sr-only">: {reason}</span> : null}
    </span>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DATE_FMT.format(t) : iso;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? `${DATETIME_FMT.format(t)} UTC` : iso;
}

export function DateTime({ iso, withTime, className }: { iso: string | null | undefined; withTime?: boolean; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} className={cn("num", className)}>
      {withTime ? formatDateTime(iso) : formatDate(iso)}
    </time>
  );
}
