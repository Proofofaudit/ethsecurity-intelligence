import type { Dataset, Initiative } from "@/lib/domain/schemas";
import { officialUrls } from "@/lib/official/client";
import { findInitiative } from "@/lib/intelligence/service";
import { notFound } from "./http";

export function requireInitiative(d: Dataset, idOrSlug: string): Initiative {
  const ini = findInitiative(d, idOrSlug);
  if (!ini) throw notFound(`No initiative with id or slug "${idOrSlug}" in the research cohort`);
  return ini;
}

/** Primary sources for one initiative: the official API record and the official page. */
export const initiativeSources = (ini: Initiative) => [...new Set([officialUrls.initiative(ini.slug), ini.url])];
