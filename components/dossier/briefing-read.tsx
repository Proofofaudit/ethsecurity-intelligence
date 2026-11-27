"use client";

import { markBriefingItem, useWorkspace } from "@/components/workspace/store";

/** Local "Mark as read" checkbox for one briefing item. Stored in this browser only. */
export function ReadMark({ id, title }: { id: string; title: string }) {
  const w = useWorkspace();
  const read = !!w.briefingRead[id];
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-3">
      <input type="checkbox" checked={read} onChange={(e) => markBriefingItem(id, e.target.checked)} className="size-3.5 accent-[var(--color-accent)]" aria-label={`Mark as read: ${title}`} data-briefing-read={id} />
      <span>Mark as read</span>
    </label>
  );
}

/** "N of M items read" and the time left in the unread items, from this browser's marks. */
export function ReadProgress({ items }: { items: { id: string; minutes: number }[] }) {
  const w = useWorkspace();
  const unread = items.filter((i) => !w.briefingRead[i.id]);
  const left = unread.reduce((n, i) => n + i.minutes, 0);
  return (
    <span className="num text-xs text-ink-3" data-briefing-progress>
      {items.length - unread.length} of {items.length} read. {left} min left in unread items.
    </span>
  );
}
