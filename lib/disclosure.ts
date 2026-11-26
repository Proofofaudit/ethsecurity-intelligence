/** Public disclosure texts shared by the web UI, the MCP server and generated research skills. */
export const REPO_URL = "https://github.com/Proofofaudit/ethsecurity-intelligence";
export const COI_SHORT = "Disclosure: this site and Proof of Audits, one of the initiatives on this ballot, have the same owner.";
/** Persistent banner shown at the top of every page (components/shell/footer.tsx CoiStrip, app/global-error.tsx). */
export const BANNER_TEXT = "Built by Proof of Audits, which has an initiative on this ballot. Unofficial tool. It never sees your vote. Every initiative is treated the same.";
/** Where the banner links: the conflict-of-interest section of the About page. */
export const BANNER_HREF = "/about#coi";
/** Organization id of Proof of Audits in the published dataset. */
export const COI_ORGANIZATION_ID = "org_proof-of-audits";

/**
 * True for the Proof of Audits organization. Use it only to show a disclosure note; never to
 * sort, filter, score or style records. tests/unit/equal-treatment.test.ts enforces this.
 */
export const isCoiOrganization = (organizationId: string | null | undefined): boolean => organizationId === COI_ORGANIZATION_ID;
