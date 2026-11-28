import { handle, load, ok } from "@/lib/api/http";
import { loadCoverage, loadTeamResearchRaw } from "@/lib/research-v2/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/team: team, delivery and claim-check research list with coverage counts. */
export const GET = handle(async () => {
  const { dataset } = await load();
  const file = loadTeamResearchRaw();
  const titles = new Map(dataset.initiatives.map((i) => [i.id, i.title]));
  const data = {
    researched: file !== null,
    generatedAt: file?.generatedAt ?? null,
    coverage: loadCoverage(),
    initiatives: (file?.initiatives ?? []).map((i) => ({
      initiativeId: i.initiativeId,
      title: titles.get(i.initiativeId) ?? null,
      members: i.members.length,
      deliveryEntries: i.deliveryTimeline.length,
      claimChecks: i.claimChecks.length,
      questions: i.questions.length,
    })),
  };
  return ok(dataset, data, {
    limitations: ["Initiatives without a research record are counted in coverage and shown as Not researched yet. Missing information is Not found in public sources."],
  });
});
