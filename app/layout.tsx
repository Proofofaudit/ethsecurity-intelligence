import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_Symbols_2 } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { CommandPaletteProvider, type PaletteInitiative, type PaletteOrganization } from "@/components/shell/command-palette";
import { CoiStrip, Footer } from "@/components/shell/footer";
import { Header } from "@/components/shell/header";
import { THEME_SCRIPT } from "@/components/shell/theme";
import { TooltipProvider } from "@/components/ui/overlay";
import { VisitTracker } from "@/components/workspace/tracker";
import type { Dataset } from "@/lib/domain/schemas";
import { loadIntelligence } from "@/lib/intelligence/load";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap", adjustFontFallback: false });
/** Fallback for arrows and key symbols (→ ↗ ⌘ ≠) that the Plex subsets do not include. Loaded only when those glyphs appear. */
const symbols = Noto_Sans_Symbols_2({ subsets: ["symbols", "math"], weight: "400", variable: "--font-symbols", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "ETHSecurity Intelligence", template: "%s · ETHSecurity Intelligence" },
  description: "Independent, evidence-first research on the initiatives on TheDAO Security Fund ballot. No ranking, no scores.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export const revalidate = 600;

function paletteData(d: Dataset): { initiatives: PaletteInitiative[]; organizations: PaletteOrganization[] } {
  const name = (id: string | null) => (id ? (d.organizations.find((o) => o.id === id)?.name ?? null) : null);
  const initiatives = [...d.initiatives]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((i) => ({
      slug: i.slug,
      title: i.title,
      shortTitle: i.shortTitle,
      organization: name(i.organizationId) ?? i.recipientTeam,
      type: i.type,
      keywords: [...i.categories.map((c) => c.label), ...i.standards, i.summary].join(" "),
    }));
  const organizations = d.organizations
    .filter((o) => !o.anonymous)
    .map((o) => ({ id: o.id, name: o.name, role: o.kind === "both" ? "Recipient and backer" : o.kind === "recipient" ? "Recipient" : o.kind === "backer" ? "Backer" : "Related" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { initiatives, organizations };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  let d: Dataset | null = null;
  try {
    d = (await loadIntelligence()).dataset;
  } catch {
    d = null;
  }
  const palette = d ? paletteData(d) : { initiatives: [], organizations: [] };
  const cohortLine = d ? `Ballot cohort · ${d.initiatives.length} initiatives` : "";
  return (
    <html lang="en-US" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${symbols.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-paper text-ink">
        <a href="#main" className="sr-only z-50 rounded-sm bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Jump to content
        </a>
        <TooltipProvider>
          <CommandPaletteProvider initiatives={palette.initiatives} organizations={palette.organizations}>
            <CoiStrip />
            <Header cohortLine={cohortLine} />
            <main id="main" tabIndex={-1} className="mx-auto max-w-[1320px] px-5 pt-8 focus:outline-none md:px-8">
              {children}
            </main>
            <Suspense fallback={null}>
              <VisitTracker />
            </Suspense>
            <Footer meta={d ? { datasetVersion: d.meta.datasetVersion, officialGeneratedAt: d.meta.officialGeneratedAt, methodologyVersion: d.meta.methodologyVersion, sourceUrl: d.meta.officialSourceUrl } : null} />
          </CommandPaletteProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
