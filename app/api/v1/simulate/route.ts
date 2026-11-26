import { findInitiative, ScenarioSchema, simulatePortfolio } from "@/lib/intelligence/service";
import { handle, load, notFound, ok, parseJsonBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/simulate: deterministic portfolio scenario over the user's assumptions. Read-only. */
export const POST = handle(async (req: Request) => {
  const scenario = await parseJsonBody(req, ScenarioSchema);
  const { dataset } = await load();
  const unknown = [...scenario.initiativeIds, ...Object.keys(scenario.extraFundingUsd)].filter((id) => !findInitiative(dataset, id));
  if (unknown.length) throw notFound(`Unknown initiative ids: ${[...new Set(unknown)].join(", ")}`);
  return ok(dataset, simulatePortfolio(dataset, scenario), {}, { cache: "private" });
});
