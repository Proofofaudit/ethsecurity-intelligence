import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";

/**
 * Minimal, safe Markdown renderer for official proposal text. Produces React elements only
 * (no HTML injection). Supports paragraphs, headings, bullet and numbered lists, links (http and
 * https only), bare URLs, inline code, bold and italics.
 */

const INLINE = /(\[([^\]]{1,300})\]\((https?:\/\/[^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(https?:\/\/[^\s<>()[\]"'`]+[^\s<>()[\]"'`.,;:!?*_])|((?<![\w*])\*([^*\n]+)\*(?![\w*]))/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1])
      out.push(
        <a key={k} href={m[3]} target="_blank" rel="noopener noreferrer nofollow" className="link">
          {m[2]}
        </a>,
      );
    else if (m[4])
      out.push(
        <code key={k} className="num rounded-xs bg-paper-2 px-1 text-[0.92em]">
          {m[5]}
        </code>,
      );
    else if (m[6])
      out.push(
        <strong key={k} className="font-semibold">
          {m[7]}
        </strong>,
      );
    else if (m[8])
      out.push(
        <a key={k} href={m[8]} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">
          {m[8]}
        </a>,
      );
    else if (m[9]) out.push(<em key={k}>{m[10]}</em>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { t: "p"; text: string } | { t: "h"; text: string } | { t: "ul" | "ol"; items: string[] };

function blocks(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ t: "p", text: para.join(" ") });
    para = [];
    if (list) out.push(list);
    list = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ t: "h", text: h[1] ?? "" });
    } else if (ul || ol) {
      const t = ul ? "ul" : "ol";
      if (para.length) {
        out.push({ t: "p", text: para.join(" ") });
        para = [];
      }
      if (!list || list.t !== t) {
        if (list) out.push(list);
        list = { t, items: [] };
      }
      list.items.push((ul ?? ol)?.[1] ?? "");
    } else if (list && raw.startsWith("  ")) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      if (list) {
        out.push(list);
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("space-y-2.5 text-base leading-[22px] text-ink-2 wrap-anywhere", className)}>
      {blocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.t === "h")
          return (
            <p key={k} className="font-semibold text-ink">
              {inline(b.text, k)}
            </p>
          );
        if (b.t === "p") return <p key={k}>{inline(b.text, k)}</p>;
        const L = b.t === "ul" ? "ul" : "ol";
        return (
          <L key={k} className={cn("space-y-1 pl-5", b.t === "ul" ? "list-[square] marker:text-ink-3" : "list-decimal marker:text-ink-3 marker:num")}>
            {b.items.map((it, j) => (
              <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>
            ))}
          </L>
        );
      })}
    </div>
  );
}

/** Applicant text block: always labeled as quoted proposal text. */
export function ApplicantQuote({ heading, source, revision, href }: { heading: string; source: string; revision: number | null; href: string }) {
  return (
    <figure className="border-l-2 border-rule-2 pl-4">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{heading}</span>
        <span>
          Applicant text, quoted from the official proposal{revision !== null ? `, revision ${revision}` : ""}.
        </span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="link">
          Source
        </a>
      </figcaption>
      <blockquote>
        <Markdown source={source} />
      </blockquote>
    </figure>
  );
}
