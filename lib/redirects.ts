/**
 * Old route to new home, applied as permanent (308) redirects in next.config.ts.
 * /workspace/briefing is not listed: it stays where it is. Fragments on the source URL are
 * kept by the browser, so /methodology#interest still lands on the right section of /about.
 */
export const REDIRECTS: readonly (readonly [source: string, destination: string])[] = [
  ["/research", "/initiatives"],
  ["/research/compare", "/initiatives#compare"],
  ["/research/graph", "/teams"],
  ["/research/coverage", "/initiatives#coverage"],
  ["/research/questions", "/initiatives#questions"],
  ["/research/blind-spots", "/initiatives#questions"],
  ["/research/changes", "/initiatives#changes"],
  ["/research/what-if", "/workspace"],
  ["/research/milestones", "/initiatives#milestones"],
  ["/research/funding", "/initiatives#funding"],
  ["/research/collaboration", "/initiatives#compare"],
  ["/lab", "/dev"],
  ["/methodology", "/about"],
  ["/status", "/about#freshness"],
  ["/corrections", "/about#corrections"],
];
