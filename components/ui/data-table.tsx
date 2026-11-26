"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { cn } from "@/lib/util/cn";

export interface ColumnMeta {
  align?: "left" | "right";
  className?: string;
  headerTitle?: string;
}

/**
 * Compact research table on TanStack Table. Sorting is manual: the caller owns the sort state
 * (for example in the URL) so the server-side ordering rules stay the single source of truth.
 */
export function DataTable<T>({
  data,
  columns,
  sorting,
  onSortingChange,
  getRowId,
  caption,
  rowClassName,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
  getRowId: (row: T) => string;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting: true,
    enableSortingRemoval: true,
    onSortingChange: (u) => onSortingChange(typeof u === "function" ? u(sorting) : u),
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-paper">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-ink">
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta as ColumnMeta | undefined;
                const sorted = h.column.getIsSorted();
                const can = h.column.getCanSort();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn("px-2 py-2 text-2xs font-medium tracking-wide text-ink-3 uppercase first:pl-0 last:pr-0", meta?.align === "right" ? "text-right" : "text-left", meta?.className)}
                    title={meta?.headerTitle}
                  >
                    {can ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", sorted && "text-ink")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span aria-hidden="true" className="num text-[10px]">
                          {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
                        </span>
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className={cn("border-b border-rule align-top hover:bg-paper-2/70", rowClassName?.(r.original))}>
              {r.getVisibleCells().map((c) => {
                const meta = c.column.columnDef.meta as ColumnMeta | undefined;
                return (
                  <td key={c.id} className={cn("px-2 py-2 first:pl-0 last:pr-0", meta?.align === "right" && "text-right", meta?.className)}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
