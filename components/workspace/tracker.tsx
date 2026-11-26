"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { setLastVisited } from "./store";

/** Remembers the last research page visited (in this browser only) so My Workspace can offer "Resume". */
export function VisitTracker() {
  const path = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!path || path === "/workspace" || path.startsWith("/api")) return;
    const q = search?.toString();
    const t = setTimeout(() => setLastVisited(q ? `${path}?${q}` : path, document.title.replace(/ · ETHSecurity Intelligence$/, "")), 400);
    return () => clearTimeout(t);
  }, [path, search]);
  return null;
}
