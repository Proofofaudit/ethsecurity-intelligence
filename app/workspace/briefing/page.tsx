import type { Metadata } from "next";
import { BriefingChain } from "@/components/dossier/briefing-chain";
import { BriefingView } from "@/components/dossier/briefing";
import { PageHead } from "@/components/ui/layout";
import { loadIntelligence } from "@/lib/intelligence/load";
import { briefingFor } from "@/lib/intelligence/service";
import { interestView } from "@/lib/vote/view-data";

export const metadata: Metadata = { title: "Briefing for all in my focus" };
export const revalidate = 600;

/** Every briefing is built on the server from the published dataset. Which ones show is decided in the browser from the local focus. */
export default async function FocusBriefingPage() {
  const { dataset: d } = await loadIntelligence();
  const entries = d.initiatives.flatMap((i) => {
    const b = briefingFor(d, i.id);
    return b ? [{ id: i.id, slug: i.slug, title: i.title, totalMinutes: b.totalMinutes, node: <BriefingView key={i.id} briefing={b} heading="h3" /> }] : [];
  });
  return (
    <>
      <PageHead eyebrow="My Ballot" title="Briefing for all in my focus" lede={<p>The 10-minute briefings for the initiatives that match your focus under May interest you, one after another in alphabetical order by title. Your focus is read in this browser and is not sent to the server.</p>} />
      <BriefingChain view={interestView(d)} entries={entries} />
    </>
  );
}
