/**
 * Research contract for team, organization and delivery evidence per initiative.
 * Written by the research workstream to data/published/team-research.json, read by the interface.
 * Every fact carries source links and a "checked on" date. Missing information is "Not found in
 * public sources", never a negative finding.
 */

export type SourceLink = { label: string; url: string };

export type PastWorkChip = { label: string; url: string; checkedOn: string };

export type TeamMember = {
  name: string;
  role: string;
  /** Public handles only, as published by the person or the applicant. Never guessed. */
  handles: { platform: string; handle: string; url: string }[];
  pastWork: PastWorkChip[];
  /** Public commit counts for the last 12 months, oldest first. Empty when not found. */
  githubMonthlyCommits: number[];
  checkedOn: string;
};

export type OrganizationProfile = {
  name: string;
  summary: string;
  website?: string;
  sources: SourceLink[];
  checkedOn: string;
};

export type DeliveryStatus = "Delivered" | "Partly delivered" | "No public evidence";

export type DeliveryTimelineEntry = {
  grant: string;
  funder: string;
  promised: string;
  status: DeliveryStatus;
  sources: SourceLink[];
  checkedOn: string;
};

export type ClaimStatus = "Verified" | "Not verified" | "Contradicted by source";

export type ClaimCheck = {
  claim: string;
  status: ClaimStatus;
  sources: SourceLink[];
  checkedOn: string;
};

export type TeamResearch = {
  initiativeId: string;
  members: TeamMember[];
  organization: OrganizationProfile | null;
  deliveryTimeline: DeliveryTimelineEntry[];
  claimChecks: ClaimCheck[];
  questions: string[];
};

export type TeamResearchFile = {
  generatedAt: string;
  initiatives: TeamResearch[];
};

export type TeamResearchResult =
  | { researched: true; data: TeamResearch }
  | { researched: false; reason: "Not researched yet" };
