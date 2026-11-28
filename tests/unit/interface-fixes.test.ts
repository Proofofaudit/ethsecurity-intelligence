import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Evidence } from "@/lib/domain/schemas";
import { CORRECTIONS_UNAVAILABLE_BODY, correctionsStoreNotice } from "@/lib/corrections/store-status";
import { EVIDENCE_KIND_LABEL, evidenceGroupTitle, evidenceKindLabel } from "@/lib/dossier/labels";
import { STALE_HEADLINE, staleInfo, syncTimes } from "@/lib/intelligence/staleness";
import { automatedChecksLabel, teamResearchCompleteCount, teamResearchLabel } from "@/lib/team/progress";
import { StaleBanner } from "@/components/shell/stale-banner";

describe("dossier evidence headings", () => {
  it("labels every evidence kind and never prints undefined", () => {
    for (const kind of Evidence.shape.kind.options) {
      expect(EVIDENCE_KIND_LABEL[kind]).toBeTruthy();
      expect(evidenceGroupTitle(kind, 3)).not.toContain("undefined");
    }
    expect(evidenceGroupTitle("http_check", 4)).toBe("Web page check (4)");
  });
  it("falls back to readable text for an unknown kind", () => {
    expect(evidenceGroupTitle("new_kind", 2)).toBe("New kind (2)");
    expect(evidenceKindLabel("")).toBe("Other");
  });
  it("the dossier page does not import the label map from the client inspector", () => {
    const page = readFileSync(join(process.cwd(), "app/initiatives/[slug]/page.tsx"), "utf8");
    expect(page).not.toMatch(/EVIDENCE_KIND_LABEL[^;]*inspector/);
  });
});

describe("stale data banner", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  it("is stale beyond 12 hours", () => {
    expect(staleInfo("2026-11-26T23:59:00Z", now).stale).toBe(true);
    expect(staleInfo("2026-11-26T13:08:39Z", now).stale).toBe(true);
  });
  it("is fresh within 12 hours", () => {
    expect(staleInfo("2026-11-27T00:00:00Z", now).stale).toBe(false);
    expect(staleInfo("2026-11-27T11:00:00Z", now).stale).toBe(false);
  });
  it("treats an unreadable timestamp as stale", () => {
    expect(staleInfo(null, now).stale).toBe(true);
    expect(staleInfo("nope", now).stale).toBe(true);
  });
  it("formats UTC and India Standard Time", () => {
    const t = syncTimes("2026-11-26T13:08:39Z");
    expect(t?.utc).toContain("13:08");
    expect(t?.utc).toMatch(/UTC$/);
    expect(t?.ist).toContain("18:38");
    expect(t?.ist).toMatch(/IST$/);
  });
  it("renders for stale data and nothing for fresh data", () => {
    const stale = StaleBanner({ officialGeneratedAt: "2026-11-26T13:08:39Z", lastSyncAt: "2026-11-26T13:08:39Z", now });
    expect(stale).not.toBeNull();
    expect(JSON.stringify(stale)).toContain(STALE_HEADLINE);
    expect(StaleBanner({ officialGeneratedAt: "2026-11-27T10:00:00Z", lastSyncAt: "2026-11-27T10:00:00Z", now })).toBeNull();
  });
});

describe("counters", () => {
  it("uses the required automated checks wording", () => {
    expect(automatedChecksLabel(55, 55)).toBe("Automated checks complete: 55 of 55 (not a human review)");
    expect(teamResearchLabel(0, 55)).toBe("Team research complete: 0 of 55");
  });
  it("counts zero when the team research file is absent", () => {
    expect(teamResearchCompleteCount(["a", "b"], join(tmpdir(), "does-not-exist.json"))).toBe(0);
  });
  it("counts researched initiatives inside the cohort", () => {
    const dir = mkdtempSync(join(tmpdir(), "team-"));
    const path = join(dir, "team-research.json");
    writeFileSync(path, JSON.stringify({ generatedAt: "x", initiatives: [{ initiativeId: "a" }, { initiativeId: "z" }] }));
    expect(teamResearchCompleteCount(["a", "b"], path)).toBe(1);
    expect(teamResearchCompleteCount(undefined, path)).toBe(2);
  });
});

describe("corrections store notice", () => {
  it("is honest about MongoDB and the Netlify file fallback", () => {
    const n = correctionsStoreNotice({ failed: false, degraded: true, backend: "file" });
    expect(n?.body).toBe(CORRECTIONS_UNAVAILABLE_BODY);
    expect(n?.body).toMatch(/unreachable/);
    expect(n?.body).toMatch(/not durable on Netlify/);
  });
  it("shows nothing when the database is healthy", () => {
    expect(correctionsStoreNotice({ failed: false, degraded: false, backend: "mongodb" })).toBeNull();
  });
});
