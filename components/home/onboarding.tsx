"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PRIVACY_LOCAL_KEYS } from "@/lib/privacy";

export const ONBOARDING_KEY = PRIVACY_LOCAL_KEYS.onboarding;

export const ONBOARDING_STEPS = [
  { icon: "search", text: "Type your name or X handle" },
  { icon: "cards", text: "See initiatives that may interest you, and why" },
  { icon: "team", text: "Open a card to see the team and what they have already shipped" },
  { icon: "vote", text: "Voting happens only on TheDAO's site, this tool never sees your vote" },
] as const;

const listeners = new Set<() => void>();
const read = () => {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "dismissed";
  } catch {
    return false;
  }
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
function dismiss() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "dismissed");
  } catch {
    /* storage disabled: hide for this page view only */
    hiddenThisView = true;
  }
  listeners.forEach((l) => l());
}
let hiddenThisView = false;

function Icon({ name }: { name: (typeof ONBOARDING_STEPS)[number]["icon"] }) {
  const common = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true, className: "shrink-0" } as const;
  if (name === "search")
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13.2 13.2 17 17" />
      </svg>
    );
  if (name === "cards")
    return (
      <svg {...common}>
        <rect x="2.5" y="3" width="6" height="6" />
        <rect x="11.5" y="3" width="6" height="6" />
        <rect x="2.5" y="11" width="6" height="6" />
        <rect x="11.5" y="11" width="6" height="6" />
      </svg>
    );
  if (name === "team")
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="2.6" />
        <circle cx="14" cy="8" r="2" />
        <path d="M2.5 16c.4-3 2.2-4.5 4.5-4.5S11.1 13 11.5 16M12 12c2.5-.4 4.8.8 5.5 4" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3.5" y="8.5" width="13" height="8" />
      <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.500" />
    </svg>
  );
}

/** Dismissible four-step intro. The dismissal is the only thing stored, in this browser. */
export function Onboarding() {
  const dismissed = useSyncExternalStore(subscribe, () => read() || hiddenThisView, () => true);
  if (dismissed) return null;
  return (
    <section aria-labelledby="onboarding-h" data-onboarding className="border-y border-rule py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboarding-h" className="text-md font-semibold">
          How this works, in 30 seconds
        </h2>
        <Button size="sm" variant="ghost" onClick={dismiss} data-onboarding-dismiss>
          Dismiss
        </Button>
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ONBOARDING_STEPS.map((s, n) => (
          <li key={s.icon} className="flex items-start gap-3 rounded-xs bg-accent-wash px-2 py-2 text-sm text-ink-2">
            <span className="flex items-center gap-2 text-accent">
              <Icon name={s.icon} />
              <span className="num flex size-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-ink">{n + 1}</span>
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
