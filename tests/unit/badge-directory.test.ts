import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BADGE_DIRECTORY, BADGE_DIRECTORY_FIELDS, BADGE_DIRECTORY_SOURCE, BadgeHolderEntry, DIRECTORY_UNAVAILABLE_NOTE, PUBLIC_SUGGESTION_LABEL, searchDirectory } from "@/lib/vote/badge-directory";
import { isNeutral } from "@/lib/neutralLanguage";

const ROOT = process.cwd();
const CONTACT = /email|e-mail|mail|telegram|linkedin|phone|twitter|discord|signal|contact|address|name/i;

describe("public badge-holder directory", () => {
  it("allows only handle, public organizations and public expertise", () => {
    expect(Object.keys(BadgeHolderEntry.shape).sort()).toEqual([...BADGE_DIRECTORY_FIELDS].sort());
    for (const k of Object.keys(BadgeHolderEntry.shape)) expect(CONTACT.test(k), k).toBe(false);
    const ok = { handle: "sample-handle", organizations: ["Sample Org"], expertise: ["DeFi auditor"] };
    expect(BadgeHolderEntry.safeParse(ok).success).toBe(true);
    for (const extra of ["email", "telegram", "linkedin", "name", "contact", "twitter"]) expect(BadgeHolderEntry.safeParse({ ...ok, [extra]: "x" }).success, extra).toBe(false);
  });

  it("ships no entries while no verifiable public source exists, and says so", () => {
    expect(BADGE_DIRECTORY_SOURCE).toBeNull();
    expect(BADGE_DIRECTORY).toEqual([]);
    expect(DIRECTORY_UNAVAILABLE_NOTE).toContain("does not compile one");
    expect(isNeutral(DIRECTORY_UNAVAILABLE_NOTE)).toBe(true);
    expect(PUBLIC_SUGGESTION_LABEL).toBe("Suggested from public information. Edit freely.");
    for (const p of ["data/public/badge-holders.json", "public/badge-holders.json"]) expect(existsSync(path.join(ROOT, p)), p).toBe(false);
  });

  it("every bundled entry validates (any future file must pass the strict schema)", () => {
    for (const e of BADGE_DIRECTORY) expect(BadgeHolderEntry.safeParse(e).success).toBe(true);
  });

  it("search is local, needs typed input and returns nothing for empty queries", () => {
    const sample = [
      { handle: "sample-a", organizations: ["Example Audits"], expertise: ["DeFi auditor"] },
      { handle: "sample-b", organizations: [], expertise: ["Wallet engineer"] },
    ];
    expect(searchDirectory(sample, "")).toEqual([]);
    expect(searchDirectory(sample, "d")).toEqual([]);
    expect(searchDirectory(sample, "defi").map((e) => e.handle)).toEqual(["sample-a"]);
    expect(searchDirectory(sample, "WALLET").map((e) => e.handle)).toEqual(["sample-b"]);
    const src = readFileSync(path.join(ROOT, "lib/vote/badge-directory.ts"), "utf8");
    expect(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src)).toBe(false);
  });
});
