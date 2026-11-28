/**
 * Ballot Prep and the Vote Calendar never connect a wallet, sign or submit anything: no wallet
 * library is installed, and nothing reachable from the Overview or My Workspace page imports one
 * or touches an injected wallet provider, signing calls or the network.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFile(path.join(ROOT, rel), "utf8");

const WALLET_PACKAGES = /^(wagmi|viem|ethers|web3|web3-.*|@wagmi\/.*|@rainbow-me\/.*|@walletconnect\/.*|@reown\/.*|@web3modal\/.*|@metamask\/.*|@coinbase\/wallet-sdk|@safe-global\/.*|connectkit|@dynamic-labs\/.*|@privy-io\/.*|@thirdweb-dev\/.*|thirdweb|@solana\/.*)$/;
const WALLET_CODE = /window\.ethereum|eth_requestAccounts|eth_sendTransaction|eth_signTypedData|personal_sign|signTypedData|writeContract|sendTransaction/;

async function resolveImport(from: string, spec: string): Promise<string | null> {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(path.join(ROOT, from)), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try {
      const st = await fs.stat(base + ext);
      if (st.isFile()) return path.relative(ROOT, base + ext);
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

/** Every local module reachable from an entry, plus every bare package it imports. */
async function importGraph(entry: string) {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = await read(file);
    for (const m of src.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^import\s+["']([^"']+)["']/gm)) {
      const spec = (m[1] ?? m[2] ?? m[3])!;
      const local = await resolveImport(file, spec);
      if (local) queue.push(local);
      else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
    }
  }
  return { files: [...seen], packages: [...packages] };
}

describe("no wallet libraries", () => {
  it("package.json has no wallet or chain-signing dependency", async () => {
    const pkg = JSON.parse(await read("package.json")) as Record<string, Record<string, string> | undefined>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies });
    expect(deps.filter((d) => WALLET_PACKAGES.test(d))).toEqual([]);
  });

  for (const entry of ["app/workspace/page.tsx", "app/page.tsx"]) {
    it(`${entry} imports no wallet library and no signing code`, async () => {
      const g = await importGraph(entry);
      expect(g.files).toContain("components/ui/thedao-status.tsx");
      expect(g.packages.filter((p) => WALLET_PACKAGES.test(p))).toEqual([]);
      for (const f of g.files) expect(WALLET_CODE.test(await read(f)), f).toBe(false);
    });
  }

  it("Ballot Prep, the Vote Calendar, the visit comparison, affiliations and May interest you make no network requests", async () => {
    for (const f of ["components/workspace/ballot-prep.tsx", "components/workspace/vote-calendar.tsx", "components/workspace/since-visit.tsx", "lib/vote/ballot-rules.ts", "lib/vote/calendar.ts", "components/workspace/affiliations.tsx", "components/workspace/may-interest.tsx", "lib/vote/affiliation.ts", "lib/vote/interest.ts", "lib/vote/badge-directory.ts"]) {
      const src = await read(f);
      expect(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|Notification|serviceWorker|mailto:/.test(src), f).toBe(false);
    }
  });
});
