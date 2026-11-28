import { STALE_AFTER_HOURS, STALE_HEADLINE, staleInfo, syncTimes } from "@/lib/intelligence/staleness";
import { LocalTime } from "./local-time";

/** Shown on every page when the official data is older than 12 hours. Renders nothing when fresh. */
export function StaleBanner({ officialGeneratedAt, lastSyncAt, now }: { officialGeneratedAt: string | null; lastSyncAt: string | null; now?: Date }) {
  const info = staleInfo(officialGeneratedAt, now);
  if (!info.stale) return null;
  const times = lastSyncAt ? syncTimes(lastSyncAt) : null;
  return (
    <div role="status" data-stale-banner="" className="border-b border-rule bg-paper-3">
      <p className="mx-auto max-w-[1320px] px-5 py-1.5 text-2xs break-words text-ink md:px-8">
        <strong className="font-semibold">{STALE_HEADLINE}.</strong> The official data is more than {STALE_AFTER_HOURS} hours old.{" "}
        {times && lastSyncAt ? (
          <>
            Last sync: <LocalTime iso={lastSyncAt} /> {" · "}
            {times.utc} {" · "}
            {times.ist}.
          </>
        ) : (
          "The last sync time is unknown."
        )}
      </p>
    </div>
  );
}
