/**
 * Evidence card (Item 8): same layout for every initiative, a source URL and checked-on date on
 * every item, broken links flagged with their date, conservative self-pledge detection, no
 * private contact details, and exact "Not found" texts.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset, Evidence, Initiative } from "@/lib/domain/schemas";
import { cardDate, checkFlag, EVIDENCE_CARD_SECTIONS, isAuditReportLink, isPrivateContact, NO_LINKS_TEXT, NO_RECIPIENT_TEXT, urlKey, type CardItem } from "@/lib/intelligence/evidence-card";
import { namesOverlap, possibleSelfPledge, SELF_PLEDGE_LABEL } from "@/lib/intelligence/self-pledge";
import { evidenceCard, evidenceCardRows, FUNDING_IDENTITY } from "@/lib/intelligence/service";
import { findBannedPhrases } from "@/lib/neutralLanguage";
import { checkUrl } from "@/research/web";

let d: Dataset;
const clone = <T>(x: T): T => structuredClone(x);
const KEYS = EVIDENCE_CARD_SECTIONS.map((s) => s.key);
const items = (c: NonNullable<ReturnType<typeof evidenceCard>>, key?: string): CardItem[] => c.sections.filter((s) => !key || s.key === key).flatMap((s) => s.items);

beforeAll(async () => {
  d = await loadPublishedDataset();
});

describe("evidence card layout and sourcing", () => {
  it("has the same section keys in the same order for all 55 initiatives", () => {
    expect(d.initiatives).toHaveLength(55);
    for (const ini of d.initiatives) {
      const c = evidenceCard(d, ini.id)!;
      expect(c.sections.map((s) => s.key), ini.slug).toEqual(KEYS);
      expect(c.sections.map((s) => s.title)).toEqual(["Shipped work", "Funding", "Prior funding", "Team and track record", "Audits or reviews", "Not found"]);
    }
  });

  it("gives every item across all initiatives an http(s) source URL, a checked-on date and one of the four source labels", () => {
    let n = 0;
    for (const ini of d.initiatives) {
      for (const i of items(evidenceCard(d, ini.id)!)) {
        n++;
        expect(i.sourceUrl, `${ini.slug}/${i.key}`).toMatch(/^https?:\/\//);
        expect(Number.isFinite(Date.parse(i.checkedAt)), `${ini.slug}/${i.key}`).toBe(true);
        expect(["Official data", "Applicant statement", "Independent evidence", "AI interpretation"]).toContain(i.sourceLabel);
        expect(i.link === null || /^https?:\/\//.test(i.link) || i.link === "#round1").toBe(true);
      }
    }
    expect(n).toBeGreaterThan(55 * 5);
  });

  it("shows pledged, received and donated as three separate official figures", () => {
    for (const ini of d.initiatives) {
      const f = items(evidenceCard(d, ini.id)!, "funding");
      expect(f.find((i) => i.key === "pledged")?.amountCents).toBe(ini.funding.pledgedCents);
      expect(f.find((i) => i.key === "received")?.amountCents).toBe(ini.funding.receivedCents);
      expect(f.find((i) => i.key === "donated")?.amountCents).toBe(ini.funding.donatedCents);
      expect(f.find((i) => i.key === "donated")?.note).toBe(FUNDING_IDENTITY);
      expect(f.some((i) => /total|raised/i.test(i.label))).toBe(false);
    }
  });

  it("uses no stars, scores or strong/weak wording and no banned phrase", () => {
    for (const ini of d.initiatives) {
      const c = evidenceCard(d, ini.id)!;
      const ours = items(c).flatMap((i) => [i.label, ...i.details, i.flag?.text ?? "", i.note ?? ""]);
      for (const t of [...ours, ...evidenceCardRows(d)[ini.id]!.parts]) {
        expect(t).not.toMatch(/\bstars?\b|\bscore|\bstrong\b|\bweak\b|\brating/i);
        expect(findBannedPhrases(t)).toEqual([]);
      }
    }
  });

  it("uses 'No designated recipient' for RFPs and the same layout as grants", () => {
    const rfp = d.initiatives.find((i) => i.type === "rfp")!;
    const team = items(evidenceCard(d, rfp.id)!, "team");
    expect(team[0]?.value).toBe(NO_RECIPIENT_TEXT);
  });
});

describe("edge cases", () => {
  it("shows the exact text when the proposal publishes no links", () => {
    const t = clone(d);
    const ini = t.initiatives.find((i) => i.type === "grant")!;
    ini.links = [];
    ini.textLinks = [];
    const nf = items(evidenceCard(t, ini.id)!, "not_found").map((i) => i.value);
    expect(nf).toContain(NO_LINKS_TEXT);
    expect(NO_LINKS_TEXT).toBe("No links published in the proposal");
    // An initiative with links never gets the text.
    const other = d.initiatives.find((i) => i.links.length > 0)!;
    expect(items(evidenceCard(d, other.id)!, "not_found").map((i) => i.value)).not.toContain(NO_LINKS_TEXT);
  });

  it("flags a failed product check as broken with the checked date", () => {
    const t = clone(d);
    const p = t.products.find((x) => x.reachable === true && !t.initiatives.some((i) => i.recipientUrl && urlKey(i.recipientUrl) === urlKey(x.url)))!;
    p.reachable = false;
    p.status = 404;
    p.checkedAt = "2026-11-20T10:00:00.000Z";
    const item = items(evidenceCard(t, p.initiativeIds[0]!)!, "shipped").find((i) => i.key === `product_${p.id}`)!;
    expect(item.flag?.kind).toBe("broken");
    expect(item.flag?.text).toBe("Link did not respond when checked on Nov 20, 2026 (HTTP 404)");
    expect(item.checkedAt).toBe("2026-11-20T10:00:00.000Z");
    expect(item.status).toBe("not_independently_verified");
  });

  it("flags a missing repository as 'Repository not found' with the checked date", () => {
    const t = clone(d);
    const r = t.repositories.find((x) => x.exists)!;
    Object.assign(r, { exists: false, error: "Repository not found or private (HTTP 404)", checkedAt: "2026-11-21T08:00:00.000Z", license: null, latestRelease: null });
    const item = items(evidenceCard(t, r.initiativeIds[0]!)!, "shipped").find((i) => i.key === `repo_${r.id}`)!;
    expect(item.flag).toEqual({ kind: "broken", text: "Repository not found when checked on Nov 21, 2026", checkedAt: "2026-11-21T08:00:00.000Z" });
    expect(evidenceCardRows(t)[r.initiativeIds[0]!]!.brokenLinks).toBeGreaterThan(0);
  });

  it("flags the real repositories that GitHub did not return", () => {
    const missing = d.repositories.filter((r) => !r.exists);
    expect(missing.length).toBeGreaterThan(0);
    for (const r of missing) {
      const item = items(evidenceCard(d, r.initiativeIds[0]!)!, "shipped").find((i) => i.key === `repo_${r.id}`)!;
      expect(item.flag?.text).toBe(`Repository not found when checked on ${cardDate(r.checkedAt)}`);
    }
  });

  it("shows an inconclusive check (rate limit or bot protection) as cached data with its age", () => {
    const f = checkFlag({ state: "inconclusive", httpStatus: 429, checkedAt: "2026-11-24T00:00:00.000Z", via: "http" }, "2026-11-27T12:00:00.000Z");
    expect(f?.kind).toBe("inconclusive");
    expect(f?.text).toBe("Check inconclusive when checked on Nov 24, 2026 (HTTP 429, bot protection or rate limit). Cached result, 3 days old at publication.");
    expect(checkFlag({ state: "ok", httpStatus: 200, checkedAt: "2026-11-24T00:00:00.000Z", via: "http" }, "2026-11-27T00:00:00.000Z")).toBeNull();
  });

  describe("link checker against a local server", () => {
    let server: Server;
    let base: string;
    beforeAll(async () => {
      server = createServer((req, res) => {
        res.writeHead(req.url?.startsWith("/ok") ? 200 : 404, { "content-type": "text/html" });
        res.end("<title>x</title>");
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("flags a link whose check returned 404 and not one that returned 200", async () => {
      const stamp = Date.now();
      const bad = await checkUrl(`${base}/gone-${stamp}`);
      const good = await checkUrl(`${base}/ok-${stamp}`);
      expect(bad.status).toBe(404);
      const t = clone(d);
      const ini = t.initiatives.find((i) => i.type === "grant" && i.recipientTeam)!;
      const ev = (c: typeof bad, id: string): Evidence => ({
        id,
        kind: "http_check",
        url: c.url,
        title: c.title ?? c.url,
        observedAt: c.checkedAt,
        facts: { status: c.status, finalUrl: c.finalUrl, reachable: c.ok, inconclusive: c.inconclusive, contentType: c.contentType, error: c.error },
        excerpt: null,
        ok: c.ok,
        provenance: { origin: "external", sourceUrls: [c.url], retrievedAt: c.checkedAt, method: "HTTP GET", version: "test" },
      });
      t.evidence.push(ev(bad, "ev_test_bad"), ev(good, "ev_test_good"));
      ini.textLinks.push({ url: bad.url, text: "gone", section: "team" }, { url: good.url, text: "fine", section: "team" });
      const team = items(evidenceCard(t, ini.id)!, "team");
      const b = team.find((i) => i.link === bad.url)!;
      const g = team.find((i) => i.link === good.url)!;
      expect(b.flag?.kind).toBe("broken");
      expect(b.flag?.text).toBe(`Link did not respond when checked on ${cardDate(bad.checkedAt)} (HTTP 404)`);
      expect(g.flag).toBeNull();
      expect(g.details[0]).toBe(`Responded (HTTP 200) when checked on ${cardDate(good.checkedAt)}`);
    });
  });
});

describe("self-pledge detection", () => {
  it("flags exact and whole-word overlaps only", () => {
    expect(namesOverlap("Blossom Labs", ["Blossom Labs"])).toBe("Blossom Labs");
    expect(namesOverlap("Blossom Labs Ltd.", ["Blossom Labs"])).toBe("Blossom Labs");
    expect(namesOverlap("ZKNOX", ["ZKnox"])).toBe("ZKnox");
    expect(namesOverlap("Zéalynx", ["Zealynx"])).toBe("Zealynx");
    expect(namesOverlap("SafeGuard", ["Safe"])).toBeNull();
    expect(namesOverlap("Safe Guard", ["Safe"])).toBe("Safe");
    expect(namesOverlap("Nethermind", ["Nethermind Security"])).toBeNull();
    expect(namesOverlap("Anonymous", ["Blossom Labs"])).toBeNull();
    expect(namesOverlap("AB Capital", ["AB"])).toBeNull();
    expect(namesOverlap("OtterSec", [])).toBeNull();
  });

  it("checks the recipient team and every recorded organization name, with the unverified label", () => {
    const r = possibleSelfPledge("Mab.xyz", { recipientTeam: null, organization: { name: "MAB", names: ["MAB", "Mab.xyz"] } });
    expect(r).toEqual({ flagged: true, matchedName: "Mab.xyz", label: SELF_PLEDGE_LABEL });
    expect(SELF_PLEDGE_LABEL).toBe("Backer name overlaps team name (possible self-pledge, unverified)");
    expect(possibleSelfPledge("OtterSec", { recipientTeam: null, organization: null }).flagged).toBe(false);
  });

  it("flags every real pledge whose backer resolves to the recipient organization, and no other", () => {
    for (const ini of d.initiatives) {
      for (const i of items(evidenceCard(d, ini.id)!, "funding").filter((x) => x.key.startsWith("pledge_"))) {
        const p = d.pledges.find((x) => `pledge_${x.id}` === i.key)!;
        expect(i.flag?.kind === "self_pledge", `${ini.slug}: ${p.company}`).toBe(!!ini.organizationId && p.backerId === ini.organizationId);
      }
    }
  });
});

describe("privacy and audits", () => {
  it("never shows email addresses, phone numbers or messenger links", () => {
    expect(isPrivateContact("mailto:a@example.org")).toBe(true);
    expect(isPrivateContact("tel:+15551234567")).toBe(true);
    expect(isPrivateContact("https://t.me/someone")).toBe(true);
    expect(isPrivateContact("https://wa.me/15551234567")).toBe(true);
    expect(isPrivateContact("https://discord.com/users/123")).toBe(true);
    expect(isPrivateContact("https://example.org/contact", "write to me@example.org")).toBe(true);
    expect(isPrivateContact("https://example.org/", "call +44 20 7946 0958")).toBe(true);
    expect(isPrivateContact("https://github.com/someone")).toBe(false);
    expect(isPrivateContact("https://www.linkedin.com/in/someone")).toBe(false);

    const t = clone(d);
    const ini = t.initiatives.find((i) => i.type === "grant" && i.recipientTeam)! as Initiative;
    t.people.push({ id: "person_test", name: "Test Person", role: null, initiativeIds: [ini.id], organizationId: ini.organizationId, publicProfiles: ["mailto:test@example.org", "https://t.me/testperson", "https://x.com/testperson"], mentionedIn: [], provenance: { origin: "applicant", sourceUrls: [ini.url], retrievedAt: ini.provenance.retrievedAt, method: "test", version: "test" } });
    ini.textLinks.push({ url: "https://wa.me/15551234567", text: "WhatsApp", section: "team" }, { url: "https://example.org/me", text: "me@example.org", section: "team" });
    const text = JSON.stringify(evidenceCard(t, ini.id));
    expect(text).toContain("x.com/testperson");
    expect(text).not.toMatch(/test@example\.org|t\.me\/testperson|wa\.me|me@example\.org/);
  });

  it("lists only links that name an audit or review report, with the unverified-scope note", () => {
    expect(isAuditReportLink("https://example.org/audits", null)).toBe(true);
    expect(isAuditReportLink("https://github.com/x/cyfrin-audit-reports", null)).toBe(true);
    expect(isAuditReportLink("https://example.org/research/lido-nest-audit-summary", null)).toBe(true);
    expect(isAuditReportLink("https://example.org/a.pdf", "Security review report")).toBe(true);
    expect(isAuditReportLink("https://audits.example.org/profile/someone", null)).toBe(false);
    expect(isAuditReportLink("https://github.com/x/audit-checklist", null)).toBe(false);
    expect(isAuditReportLink("https://example.org/audit", null)).toBe(false);
    expect(isAuditReportLink("https://initiatives.thedao.fund/initiative/audit-reports-for-all", null)).toBe(false);
    for (const ini of d.initiatives) {
      const c = evidenceCard(d, ini.id)!;
      const a = items(c, "audits");
      const nf = items(c, "not_found").map((i) => i.value);
      expect(nf.includes("No public audit report linked")).toBe(a.length === 0);
      for (const i of a) expect(i.note).toBe("Linked in the proposal. Which work the report covers was not verified.");
    }
  });
});
