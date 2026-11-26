/**
 * Privacy guarantees that can be checked without a browser: the Methodology Privacy section
 * names the real storage keys, server logs never carry request content, the browser may only
 * contact this origin, and no third-party scripts, fonts or analytics are referenced.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEMPLATES_KEY } from "@/components/lab/templates";
import { THEME_KEY } from "@/components/shell/theme";
import { WORKSPACE_KEY } from "@/components/workspace/store";
import { CONTACT_RETENTION_DAYS } from "@/lib/corrections";
import { PRIVACY_LOCAL_KEYS } from "@/lib/privacy";
import { describeError, logServerError } from "@/lib/util/log";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFile(path.join(ROOT, rel), "utf8");

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await files(rel)));
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe("Methodology Privacy section", () => {
  it("lists the localStorage keys the code actually uses", () => {
    expect(PRIVACY_LOCAL_KEYS).toEqual({ workspace: WORKSPACE_KEY, labTemplates: TEMPLATES_KEY, theme: THEME_KEY });
  });

  it("is linked from the page contents and states what is and is not stored", async () => {
    const src = await read("app/methodology/page.tsx");
    expect(src).toContain('["privacy", "Privacy"]');
    expect(src).toContain('<Block id="privacy" title="Privacy"');
    for (const heading of ["Stored only in your browser", "Stored on the server", "Never stored"]) expect(src).toContain(heading);
    for (const key of Object.keys(PRIVACY_LOCAL_KEYS)) expect(src).toContain(`PRIVACY_LOCAL_KEYS.${key}`);
    expect(src).toContain("CONTACT_RETENTION_DAYS");
    expect(CONTACT_RETENTION_DAYS).toBe(30);
    for (const never of ["Votes, ballots, wallet addresses", "Search text", "AI Lab prompts", "names you type"]) expect(src).toContain(never);
  });

  it("matches the only browser storage used by components and app code", async () => {
    const all = [...(await files("components")), ...(await files("app"))];
    const users: string[] = [];
    for (const f of all) if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(await read(f))) users.push(f);
    expect(users.sort()).toEqual(["components/lab/templates.ts", "components/shell/theme.ts", "components/workspace/store.ts"]);
  });
});

describe("server logs", () => {
  it("record the error class and code, never the message", () => {
    const err = Object.assign(new SyntaxError('Unexpected token in JSON at "my secret search about Alice"'), { code: "E_PARSE" });
    expect(describeError(err)).toBe("SyntaxError code=E_PARSE");
    expect(describeError("plain string with a prompt")).toBe("string");
    expect(describeError({ code: "has spaces and user text" })).toBe("Error");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logServerError("api", "unexpected error", err);
    expect(spy).toHaveBeenCalledWith("[api] unexpected error: SyntaxError code=E_PARSE");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("Alice");
  });

  it("are written only through logServerError in request handlers", async () => {
    const handlers = [...(await files("app/api")), "lib/api/http.ts", "mcp/server.ts"];
    const raw: string[] = [];
    for (const f of handlers) {
      const src = await read(f);
      if (/console\.(log|info|warn|error|debug)\(/.test(src)) raw.push(f);
      // Request data must never be interpolated into a log line.
      if (/logServerError\([^)]*(req|url|query|body|args|searchParams)\b/.test(src)) raw.push(`${f} (request data in log)`);
    }
    expect(raw).toEqual([]);
  });

  it("disable the framework's request and full-URL fetch logging", async () => {
    const config = (await import("@/next.config")).default;
    expect(config.logging).toEqual({ incomingRequests: false, fetches: { fullUrl: false } });
  });
});

describe("same-origin browser", () => {
  it("sends a Content-Security-Policy that allows only this origin", async () => {
    const config = (await import("@/next.config")).default;
    const headers = (await config.headers!())[0]!.headers;
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    const directives = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(directives["default-src"]).toEqual(["'self'"]);
    for (const d of ["script-src", "style-src", "img-src", "font-src", "connect-src"]) {
      for (const source of directives[d] ?? []) expect(source, `${d} ${source}`).toMatch(/^('self'|'unsafe-inline'|'unsafe-eval'|data:|blob:|ws:|wss:)$/);
    }
    expect(directives["font-src"]).toEqual(["'self'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("references no third-party scripts, stylesheets, fonts or analytics in app or component code", async () => {
    const offenders: string[] = [];
    const external = /<(script|link|iframe)\b[^>]*\b(src|href)=["'{`]*https?:\/\//i;
    const known = /(fonts\.googleapis|fonts\.gstatic|googletagmanager|google-analytics|plausible|segment\.(io|com)|mixpanel|posthog|hotjar|sentry|vercel-insights|@vercel\/analytics|cdn\.jsdelivr|unpkg\.com|cdnjs)/i;
    for (const f of [...(await files("app")), ...(await files("components"))]) {
      const src = await read(f);
      if (external.test(src) || known.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
    const pkg = JSON.parse(await read("package.json")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).filter((n) => known.test(n) || /analytics|telemetry/i.test(n))).toEqual([]);
  });

  it("fetches from the browser only same-origin API paths", async () => {
    const calls: string[] = [];
    for (const f of await files("components")) {
      for (const m of (await read(f)).matchAll(/fetch\(\s*(["'`])([^"'`]*)/g)) calls.push(`${f}: ${m[2]}`);
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/: \/api\/v1\//);
  });
});
