import { categoryDistribution, coverage } from "@/lib/intelligence/service";
import { handle, load, ok } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/coverage: lifecycle-stage coverage and official category distribution of the cohort. */
export const GET = handle(async () => {
  const { dataset } = await load();
  return ok(dataset, { ...coverage(dataset), categories: categoryDistribution(dataset) }, {
    limitations: ["Lifecycle-stage mapping is rule-based term matching; each initiative lists the terms that matched."],
  });
});
