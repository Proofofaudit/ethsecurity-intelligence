/** Navigation model shared by the shell, the command palette and the Overview shortcuts. */
export interface PageItem {
  label: string;
  href: string;
  hint: string;
  keywords?: string;
}

export const PRIMARY_NAV: PageItem[] = [
  { label: "Home", href: "/", hint: "Research first, then the official figures" },
  { label: "Initiatives", href: "/initiatives", hint: "All initiatives, filters, compare and questions to check", keywords: "search filter compare milestones funding changes questions" },
  { label: "Teams", href: "/teams", hint: "People map and team research", keywords: "people graph relationships organizations" },
  { label: "My Ballot", href: "/workspace", hint: "Saved initiatives, notes and ballot prep", keywords: "saved bookmarks notes workspace what-if scenario" },
  { label: "About", href: "/about", hint: "Disclosure, methodology, freshness and corrections", keywords: "disclosure methodology status corrections ai" },
];

/** Extra command palette shortcuts that point inside the five tabs. */
export const ADVANCED_VIEWS: PageItem[] = [
  { label: "Compare initiatives", href: "/initiatives#compare", hint: "Side by side, two to five initiatives", keywords: "comparison versus" },
  { label: "Security coverage map", href: "/initiatives#coverage", hint: "Lifecycle stages and the initiatives addressing them", keywords: "lifecycle stages gaps" },
  { label: "Questions to check", href: "/initiatives#questions", hint: "Open questions and blind spots in one list", keywords: "open questions blind spots gaps" },
  { label: "Milestones", href: "/initiatives#milestones", hint: "Every milestone, budget and acceptance criterion", keywords: "milestones deliverables adoption" },
  { label: "Funding relationships", href: "/initiatives#funding", hint: "Self-pledges, multi-backers and concentration", keywords: "backers pledges donors" },
  { label: "What changed", href: "/initiatives#changes", hint: "Funding, revisions and corrections", keywords: "time machine history diff" },
];

export const REFERENCE_PAGES: PageItem[] = [
  { label: "Methodology", href: "/about#methodology", hint: "Metric definitions and evidence statuses" },
  { label: "Public corrections", href: "/about#corrections", hint: "Moderated corrections changelog" },
  { label: "Data freshness", href: "/about#freshness", hint: "Last official sync and research run", keywords: "status sync update" },
  { label: "Disclosure", href: "/about#coi", hint: "Who publishes this site", keywords: "conflict of interest proof of audits" },
  { label: "Why AI is here", href: "/about#ai", hint: "What the AI does and does not do" },
  { label: "Developers", href: "/dev", hint: "MCP server, brief export and paste-in reader", keywords: "mcp skill prompt agent api" },
];
