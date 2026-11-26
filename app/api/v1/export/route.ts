import { z } from "zod";
import { exportBundle, findInitiative } from "@/lib/intelligence/service";
import { handle, IdParam, load, notFound, ok, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ ids: z.array(IdParam).min(1).max(55).optional() }).strict();

/** GET /api/v1/export[?ids=]: downloadable evidence bundle (whole cohort or selected initiatives). */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { arrays: ["ids"] });
  const { dataset } = await load();
  const unknown = (q.ids ?? []).filter((id) => !findInitiative(dataset, id));
  if (unknown.length) throw notFound(`Unknown initiative ids: ${unknown.join(", ")}`);
  const filename = `ethsecurity-evidence-bundle-${dataset.meta.datasetVersion.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
  return ok(dataset, exportBundle(dataset, q.ids), {}, { cache: "public", headers: { "Content-Disposition": `attachment; filename="${filename}"` } });
});
