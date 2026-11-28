"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Local time in the reader's time zone. Renders an empty placeholder on the server. */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(Date.parse(iso)),
    () => "",
  );
  return <time dateTime={iso}>{text ? `${text} local` : "local time loading"}</time>;
}
