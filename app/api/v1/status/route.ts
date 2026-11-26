import { ingestionStatus } from "@/lib/intelligence/status";
import { handle, load, ok } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/status: store health, last successful sync, failed requests, freshness and research coverage. */
export const GET = handle(async () => {
  const { dataset, health } = await load();
  return ok(dataset, ingestionStatus(dataset, health), {}, { cache: "private" });
});
