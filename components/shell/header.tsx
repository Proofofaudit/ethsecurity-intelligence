"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/util/cn";
import { PaletteButton } from "./command-palette";
import { PRIMARY_NAV } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/research") return path.startsWith("/research") || path.startsWith("/initiatives") || path.startsWith("/entities");
  return path.startsWith(href);
}

export function Header({ cohortLine }: { cohortLine: string }) {
  const path = usePathname() ?? "/";
  const [menu, setMenu] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper">
      <div className="mx-auto flex h-13 max-w-[1320px] items-center gap-6 px-5 md:px-8">
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">ETHSecurity Intelligence</span>
          <span className="num hidden text-2xs text-ink-3 lg:inline">{cohortLine}</span>
        </Link>
        <nav aria-label="Primary" className="max-md:hidden">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((n) => {
              const active = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("relative flex h-13 items-center px-2.5 text-sm text-ink-2 hover:text-ink", active && "font-medium text-ink after:absolute after:inset-x-2.5 after:bottom-[-1px] after:h-[2px] after:bg-ink")}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <PaletteButton />
          <ThemeToggle />
          <button
            type="button"
            className="flex h-8 items-center rounded-sm px-2 text-sm text-ink-2 hover:bg-paper-2 md:hidden"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-rule md:hidden">
          <ul className="mx-auto max-w-[1320px] px-5 py-1">
            {PRIMARY_NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setMenu(false)}
                  aria-current={isActive(path, n.href) ? "page" : undefined}
                  className={cn("flex items-baseline justify-between border-b border-rule py-3 text-md last:border-0", isActive(path, n.href) ? "font-medium text-ink" : "text-ink-2")}
                >
                  {n.label}
                  <span className="text-xs text-ink-3">{n.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
