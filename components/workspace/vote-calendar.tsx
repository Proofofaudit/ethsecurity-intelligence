"use client";

import { useSyncExternalStore } from "react";
import { ExternalLink } from "@/components/ui/button";
import { formatDateTime } from "@/components/ui/money";
import { calendarState, FALLBACK_LABEL, formatCountdown, formatInZone, IST, LOCKOUT_TEXT, POST_DATES, REVISE_TEXT, SETTLED_HEADING, TIER_NAMES, VOTE_APP_URL, VOTING_POST_URL } from "@/lib/vote/calendar";
import type { CalendarView } from "@/lib/vote/view-data";
import { cn } from "@/lib/util/cn";

let tick = 0;
function subscribeNow(cb: () => void) {
  const id = window.setInterval(() => {
    tick = Date.now();
    cb();
  }, 20_000);
  return () => window.clearInterval(id);
}
const getNow = () => (tick ||= Date.now());
const getServerNow = () => null;

/**
 * Vote Calendar strip. The server renders tally times in UTC; the countdown, the viewer's local
 * time and IST are computed in the browser after hydration, so server and client markup match.
 */
export function VoteCalendar({ view, className }: { view: CalendarView; className?: string }) {
  const now = useSyncExternalStore(subscribeNow, getNow, getServerNow);
  const { schedule } = view;
  const state = now === null ? null : calendarState(schedule, now);
  const settled = state?.phase === "settled";
  const target = state?.next ?? 0;
  const targetMs = schedule.tallies[target] ?? schedule.tallies[0];

  let heading: string;
  if (settled) heading = SETTLED_HEADING;
  else if (state && state.next === null) heading = "All tier tallies have started";
  else heading = `${TIER_NAMES[target]} first tally`;

  return (
    <section aria-labelledby="vote-calendar-h" data-vote-calendar data-phase={state?.phase ?? "server"} data-fallback={schedule.fallback ? "" : undefined} className={cn("border-y border-ink py-4", className)}>
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="eyebrow mb-1 flex flex-wrap items-baseline gap-x-3">
            <span>Vote calendar</span>
            {schedule.fallback && (
              <span data-fallback-label className="font-medium text-st-partial normal-case">
                {FALLBACK_LABEL}
              </span>
            )}
          </p>
          <h2 id="vote-calendar-h" className="text-lg font-semibold">
            {heading}
            {!settled && state?.remainingMs !== null && state?.remainingMs !== undefined && (
              <>
                {" "}
                in{" "}
                <span className="num" data-countdown>
                  {formatCountdown(state.remainingMs)}
                </span>
              </>
            )}
          </h2>
          {!settled && (
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-3">Your time</dt>
                <dd className="num" data-tz="local">
                  {now === null ? "Loads in your browser" : formatInZone(targetMs)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">UTC</dt>
                <dd className="num" data-tz="utc">
                  {formatInZone(targetMs, "UTC")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">India (IST)</dt>
                <dd className="num" data-tz="ist">
                  {formatInZone(targetMs, IST)}
                </dd>
              </div>
            </dl>
          )}
          {!settled && <p className="mt-3 text-sm font-medium">{LOCKOUT_TEXT}</p>}
          <p className="mt-1 text-sm">
            <ExternalLink href={VOTE_APP_URL}>Open official vote app</ExternalLink>
            <span className="ml-2 text-xs text-ink-3">This site never connects a wallet or submits a ballot.</span>
          </p>
        </div>
        <div className="min-w-0">
          <ol className="divide-y divide-rule border-y border-rule text-sm">
            {TIER_NAMES.map((name, i) => {
              const at = schedule.tallies[i];
              const started = now !== null && at !== null && at !== undefined && now >= at;
              return (
                <li key={name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5" data-tally={i}>
                  <span>
                    {name} first tally
                    {at !== null && at !== undefined && <span className="num ml-2 text-xs text-ink-3">{formatInZone(at, "UTC")}</span>}
                  </span>
                  <span className={cn("num text-xs", started ? "text-ink-3" : "text-ink-2")}>{at === null || at === undefined ? "Manifest unavailable" : now === null ? "" : started ? "Started" : "Upcoming"}</span>
                </li>
              );
            })}
            <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5">
              <span>{POST_DATES.results}</span>
              <span className="text-xs text-ink-3">S, A, B</span>
            </li>
            <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5", settled && "font-medium")}>
              <span>{POST_DATES.community}</span>
              <span className="text-xs text-ink-3">{settled ? "Now" : "After B-tier"}</span>
            </li>
          </ol>
          <p className="mt-2 text-xs text-ink-2">{REVISE_TEXT} A tier settles within 48 hours of its first tally.</p>
          <p className="mt-1 text-2xs text-ink-3">
            {schedule.fallback ? (
              <>S-tier time is the documented fallback (Thu 3 Dec 2026, 21:00 UTC) because the manifest schedule is unavailable. </>
            ) : (
              <>Tally times: official vote manifest, schedule.firstTallyAt{view.manifestFetchedAt ? `, fetched ${formatDateTime(view.manifestFetchedAt)}` : ""}. </>
            )}
            Results and community funding dates: <ExternalLink href={VOTING_POST_URL}>TheDAO voting post, 17 Nov 2026</ExternalLink>. No reminders, notifications or emails are sent.
          </p>
        </div>
      </div>
    </section>
  );
}
