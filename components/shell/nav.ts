/** Navigation model shared by the shell, the command palette and the Overview shortcuts. */
export interface PageItem {
  label: string;
  href: string;
  hint: string;
  keywords?: string;
}

export const PRIMARY_NAV: PageItem[] = [
  { label: "Overview", href: "/", hint: "Cohort figures, coverage and changes" },
  { label: "Research", href: "/research", hint: "Search and filter all initiatives" },
  { label: "My Workspace", href: "/workspace", hint: "Saved initiatives, searches and notes", keywords: "saved bookmarks notes" },
  { label: "AI Lab", href: "/lab", hint: "MCP server, prompts and research skills", keywords: "mcp skill prompt agent" },
];

export const ADVANCED_VIEWS: PageItem[] = [
  { label: "Compare initiatives", href: "/research/compare", hint: "Side by side, two to five initiatives", keywords: "comparison versus" },
  { label: "Relationship graph", href: "/research/graph", hint: "Organizations, backers, repositories and initiatives", keywords: "network entity map connections" },
  { label: "Security coverage map", href: "/research/coverage", hint: "Lifecycle stages and the initiatives addressing them", keywords: "lifecycle stages gaps" },
  { label: "Open questions, all initiatives", href: "/research/questions", hint: "Rule-based questions per category, alphabetical", keywords: "questions gaps timeline delivery funding adoption evidence" },
  { label: "Research blind spots", href: "/research/blind-spots", hint: "Open questions raised by the evidence record", keywords: "questions gaps uncertainty" },
  { label: "Changes over time", href: "/research/changes", hint: "Funding, revisions and corrections", keywords: "time machine history diff" },
  { label: "What-if laboratory", href: "/research/what-if", hint: "Exploration only, not a prediction", keywords: "scenario simulate budget" },
  { label: "Milestone X-Ray, all initiatives", href: "/research/milestones", hint: "Every milestone, budget and acceptance criterion", keywords: "milestones deliverables adoption" },
  { label: "Funding relationships", href: "/research/funding", hint: "Backers and pledges across initiatives", keywords: "backers pledges donors" },
  { label: "Collaboration discovery", href: "/research/collaboration", hint: "Possible overlaps and complements (hypotheses)", keywords: "overlap complement similar" },
];

export const REFERENCE_PAGES: PageItem[] = [
  { label: "Methodology", href: "/methodology", hint: "Metric definitions and evidence statuses" },
  { label: "Public corrections", href: "/corrections", hint: "Moderated corrections changelog" },
  { label: "Data freshness", href: "/status", hint: "Last official sync and research run", keywords: "status sync update" },
  { label: "About and conflict-of-interest disclosure", href: "/about", hint: "Who publishes this site", keywords: "disclosure proof of audits" },
];
