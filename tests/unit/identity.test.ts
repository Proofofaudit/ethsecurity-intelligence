import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { identityDomain, isAnonymousLabel, resolveIdentities, strictKey, type NameRecord } from "@/lib/domain/identity";
import type { Dataset } from "@/lib/domain/schemas";

let n = 0;
const rec = (name: string, url: string | null = null, role: NameRecord["role"] = "backer"): NameRecord => ({ name, url, role, initiativeId: `ini_${n}`, ref: `ref_${n++}` });
const makeId = (name: string) => `org_${strictKey(name)}`;
const entityOf = (r: ReturnType<typeof resolveIdentities>, name: string) => r.entities.find((e) => e.names.includes(name));

describe("identity resolution rules", () => {
  it("merges names that are identical after case and punctuation folding", () => {
    const r = resolveIdentities([rec("ZKnox"), rec("ZKNOX"), rec("Z.Knox")], [], makeId);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0]?.resolutions.every((x) => x.resolution === "exact_normalized")).toBe(true);
  });

  it("merges names that link to the same official website", () => {
    const r = resolveIdentities([rec("Foo Research", "https://foo.xyz", "recipient"), rec("Foo", "https://www.foo.xyz/about")], [], makeId);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0]?.name).toBe("Foo Research");
    expect(r.entities[0]?.resolutions[0]).toMatchObject({ resolution: "same_official_domain" });
    expect(r.entities[0]?.resolutions[0]?.sourceUrls.length).toBeGreaterThan(0);
  });

  it("does not merge different owners on shared hosts", () => {
    expect(identityDomain("https://github.com/alice/repo")).toBe("github.com/alice");
    expect(identityDomain("https://x.com/")).toBeNull();
    const r = resolveIdentities([rec("Alice Dev", "https://github.com/alice"), rec("Bob Dev", "https://github.com/bob")], [], makeId);
    expect(r.entities).toHaveLength(2);
  });

  it("merges curated aliases only with their cited sources", () => {
    const curated = [{ names: ["Acme Security", "ACME Intel"], canonicalName: "Acme Security", reason: "Proposal states ACME Intel is run by Acme Security.", sourceUrls: ["https://example.org/proof"] }];
    const r = resolveIdentities([rec("Acme Security", "https://acme.one"), rec("ACME Intel", "https://intel.example")], curated, makeId);
    expect(r.entities).toHaveLength(1);
    const res = r.entities[0]?.resolutions.find((x) => x.resolution === "curated_with_evidence");
    expect(res?.sourceUrls).toEqual(["https://example.org/proof"]);
  });

  it("never merges anonymous labels, even when spelled identically", () => {
    expect(isAnonymousLabel("Anon Hero")).toBe(true);
    expect(isAnonymousLabel("ANON HERO")).toBe(true);
    expect(isAnonymousLabel("Anonymity Labs")).toBe(false);
    const r = resolveIdentities([rec("Anon Hero"), rec("Anon Hero"), rec("ANON HERO")], [], makeId);
    expect(r.entities).toHaveLength(3);
    expect(new Set(r.entities.map((e) => e.id)).size).toBe(3);
    for (const e of r.entities) {
      expect(e.anonymous).toBe(true);
      expect(e.resolutions[0]?.resolution).toBe("anonymous_not_merged");
    }
    expect(r.candidates).toEqual([]);
  });

  it("keeps similar names without shared evidence as candidates only", () => {
    const r = resolveIdentities(
      [
        rec("SEETA, Libp2p", "https://seeta.example", "recipient"),
        rec("Seeta", "https://other-seeta.example"),
        rec("OKcontract Labs", "https://okcontract.example", "recipient"),
        rec("OKcontract", "https://okc.example"),
        rec("ValOS-Lionscraft", "https://valos.example", "recipient"),
        rec("Lionscraft", "https://lionscraft.example"),
      ],
      [],
      makeId,
    );
    expect(r.entities).toHaveLength(6);
    for (const [a, b] of [
      ["SEETA, Libp2p", "Seeta"],
      ["OKcontract Labs", "OKcontract"],
      ["ValOS-Lionscraft", "Lionscraft"],
    ] as const) {
      const ea = entityOf(r, a);
      const eb = entityOf(r, b);
      expect(ea?.id).not.toBe(eb?.id);
      expect(r.candidates.some((c) => (c.a === ea?.id && c.b === eb?.id) || (c.a === eb?.id && c.b === ea?.id)), `${a} / ${b}`).toBe(true);
    }
  });
});

describe("identity resolution in the published dataset", () => {
  let d: Dataset;
  beforeAll(async () => {
    d = await loadPublishedDataset();
  });

  it("keeps every Anon Hero pledge as a separate, unmerged backer", () => {
    const anon = d.organizations.filter((o) => isAnonymousLabel(o.name));
    expect(anon.length).toBeGreaterThan(1);
    expect(anon.every((o) => o.anonymous)).toBe(true);
    for (const o of anon) expect(d.pledges.filter((p) => p.backerId === o.id).length, o.id).toBe(1);
  });

  it("lists SEETA/Seeta, OKcontract Labs/OKcontract and ValOS-Lionscraft/Lionscraft as unconfirmed candidates", () => {
    const pairs = [
      ["org_seeta-libp2p", "org_seeta"],
      ["org_okcontract-labs", "org_okcontract"],
      ["org_valos-lionscraft", "org_lionscraft"],
    ];
    for (const [a, b] of pairs) {
      expect(d.organizations.some((o) => o.id === a), a).toBe(true);
      expect(d.organizations.some((o) => o.id === b), b).toBe(true);
      const alias = d.aliases.find((x) => (x.organizationId === a && x.candidateOrganizationId === b) || (x.organizationId === b && x.candidateOrganizationId === a));
      expect(alias?.resolution, `${a} / ${b}`).toBe("candidate_unconfirmed");
    }
  });

  it("backs every merged alias with a shared domain or cited sources", () => {
    for (const a of d.aliases) {
      if (a.resolution === "curated_with_evidence") expect(a.sourceUrls.length, a.alias).toBeGreaterThan(0);
      if (a.resolution === "same_official_domain") expect(a.sourceUrls.length > 0 || /same website/.test(a.reason), a.alias).toBe(true);
    }
  });
});
