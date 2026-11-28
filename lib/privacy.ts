/**
 * Browser storage keys listed in the Privacy section of the Methodology page.
 * tests/unit/privacy.test.ts keeps them equal to the constants used by components/.
 */
export const PRIVACY_LOCAL_KEYS = { workspace: "esi.workspace", labTemplates: "esi.lab.templates", theme: "esi.theme", onboarding: "esi.onboarding" } as const;
