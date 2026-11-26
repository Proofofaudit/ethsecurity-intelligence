import { z } from "zod";
import { findInitiative, metricsFor } from "@/lib/intelligence/service";
import { METRICS } from "@/lib/metrics/registry";
import { handle, IdParam, load, notFound, ok, parseQuery } from "@/lib/api/http";
import { initiativeSources } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ initiative: IdParam.optional() }).strict();

/** GET /api/v1/metrics[?initiative=]: computed metric values plus the metric registry (definitions and formulas). */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query);
  const { dataset } = await load();
  const ini = q.initiative ? findInitiative(dataset, q.initiative) : undefined;
  if (q.initiative && !ini) throw notFound(`No initiative with id or slug "${q.initiative}"`);
  const level = ini ? "initiative" : "cohort";
  return ok(
    dataset,
    { level, initiativeId: ini?.id ?? null, values: metricsFor(dataset, ini?.id), registry: METRICS.filter((m) => m.level === level) },
    { sources: ini ? initiativeSources(ini) : undefined },
  );
});
