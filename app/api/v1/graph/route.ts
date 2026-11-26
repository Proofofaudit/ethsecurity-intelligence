import { z } from "zod";
import { EntityType, RelationType } from "@/lib/domain/schemas";
import { findInitiative, graphNeighborhood } from "@/lib/intelligence/service";
import { handle, IdParam, load, notFound, ok, parseQuery } from "@/lib/api/http";
import { entityExists } from "@/lib/api/entity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z
  .object({
    type: EntityType,
    id: IdParam,
    depth: z.number().int().min(1).max(2).optional(),
    types: z.array(RelationType).max(RelationType.options.length).optional(),
    includeInferred: z.boolean().optional(),
    includeMilestones: z.boolean().optional(),
  })
  .strict();

/** GET /api/v1/graph?type=&id=: entity-first relationship neighborhood (depth 1 or 2). */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { arrays: ["types"], numbers: ["depth"], booleans: ["includeInferred", "includeMilestones"] });
  const { dataset } = await load();
  // Initiatives may be addressed by slug; the graph is keyed by id.
  const id = q.type === "initiative" ? (findInitiative(dataset, q.id)?.id ?? q.id) : q.id;
  if (!entityExists(dataset, q.type, id)) throw notFound(`No ${q.type} with id "${q.id}" in the published dataset`);
  const graph = graphNeighborhood(dataset, { type: q.type, id }, { depth: q.depth, types: q.types, includeInferred: q.includeInferred, includeMilestones: q.includeMilestones });
  return ok(dataset, { root: { type: q.type, id }, ...graph }, {
    limitations: ["Edges with confidence 'inferred' (potentially_overlaps, potentially_complements) are research hypotheses, not confirmed relationships."],
  });
});
