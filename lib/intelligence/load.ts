import { getStore } from "@/lib/db";
import { applyCorrections } from "@/lib/corrections";
import type { Dataset } from "@/lib/domain/schemas";
import type { IntelligenceStore, StoreHealth } from "@/lib/db/types";

/**
 * Single entry point used by pages, API routes and the MCP server: the published dataset with
 * accepted corrections overlaid. Corrections therefore propagate everywhere at read time.
 */
export async function loadIntelligence(): Promise<{ dataset: Dataset; store: IntelligenceStore; health: StoreHealth }> {
  const store = await getStore();
  const [base, corrections, health] = await Promise.all([
    store.getDataset(),
    store.listCorrections({ states: ["accepted", "partially_accepted", "resolved"] }).catch(() => []),
    store.health(),
  ]);
  return { dataset: applyCorrections(base, corrections), store, health };
}
