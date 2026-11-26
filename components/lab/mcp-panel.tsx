"use client";

import { mcpConnection, REQUESTED_CAPABILITIES, TOOLS } from "@/lib/mcp/catalog";
import { CopyButton } from "./copy";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 border-b border-rule py-2.5 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
      <span className="text-xs text-ink-3">{label}</span>
      <code className="min-w-0 font-mono text-[12.5px] break-all text-ink">{value}</code>
      <CopyButton text={value} variant="ghost" />
    </div>
  );
}

export function McpPanel({ siteUrl }: { siteUrl: string }) {
  const c = mcpConnection(siteUrl);
  return (
    <section aria-labelledby="mcp-h" className="border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mcp-h" className="text-md font-semibold">
          Connect an assistant over MCP
        </h2>
        <p className="text-xs text-ink-3">
          Read-only. {TOOLS.length} tools cover the {REQUESTED_CAPABILITIES.length} research capabilities.
        </p>
      </div>
      <p className="max-w-[860px] text-sm text-ink-2">
        The Model Context Protocol server exposes the same published dataset and the same calculations as this website and its exports. It has no write access, no free-form database queries and no private correction data. Every result carries its sources, data freshness, methodology and limitations.
      </p>
      <div className="mt-4 border-t border-rule">
        <Row label="Remote (Streamable HTTP)" value={c.remoteUrl} />
        <Row label="Local (stdio)" value={`${c.stdio.command} ${c.stdio.args.join(" ")}`} />
      </div>
      <p className="mt-2 text-xs text-ink-3">{c.stdio.note} Replace /path/to/ethsecurity-intelligence with the folder of your clone.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        {c.clients.map((cl) => (
          <div key={cl.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {cl.name} <span className="font-normal text-ink-3">· {cl.file}</span>
              </p>
              <CopyButton text={cl.config} variant="ghost" />
            </div>
            <pre className="overflow-x-auto rounded-xs border border-rule bg-paper-2 p-3 font-mono text-[12px] leading-[18px] text-ink-2">{cl.config}</pre>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-3">Example configurations. Client settings change between versions, so check your assistant&apos;s documentation for the exact file and fields.</p>

      <details className="mt-6 border-t border-rule pt-3">
        <summary className="cursor-pointer text-sm font-medium hover:text-accent">Tools and the capabilities they cover</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs text-ink-3">
                <th className="py-1.5 pr-4 font-normal">Tool</th>
                <th className="py-1.5 pr-4 font-normal">What it returns</th>
                <th className="py-1.5 font-normal">Covers</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name} className="border-b border-rule align-top">
                  <td className="py-2 pr-4 font-mono text-[12.5px] whitespace-nowrap">{t.name}</td>
                  <td className="py-2 pr-4 text-ink-2">{t.description}</td>
                  <td className="py-2 font-mono text-[12px] text-ink-3">
                    {t.covers.map((x) => (
                      <span key={`${x.name}-${x.how}`} className="block whitespace-nowrap" title={x.how}>
                        {x.name}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
