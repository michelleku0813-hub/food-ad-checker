import { formatFine, formatMonth, shortLaw, type Case } from "@/lib/format";

type Props = {
  c: Omit<Case, "detail"> & { detail?: string };
  highlight?: string[];
  showDetail?: boolean;
};

export function CaseCard({ c, highlight = [], showDetail = false }: Props) {
  const hl = new Set(highlight);
  return (
    <article id={c.id} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono">{c.id}</span>
        <span>·</span>
        <span>{formatMonth(c.month)}公告</span>
        <span>·</span>
        <span>發文 {c.date}</span>
        <span>·</span>
        <span>{c.source}</span>
        {c.productType === "健康食品" && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">健康食品</span>
        )}
      </div>
      <h3 className="mt-1.5 font-semibold leading-snug">{c.product}</h3>
      <p className="mt-0.5 text-sm text-muted">{c.company}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
          罰鍰 {formatFine(c.fine)}
        </span>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{shortLaw(c.law)}</span>
        <span className="text-muted">{c.category}</span>
      </div>
      {c.claims.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted">被罰詞句</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {c.claims.slice(0, 14).map((p) => (
              <li
                key={p}
                className={
                  hl.has(p)
                    ? "rounded bg-amber-200 px-1.5 py-0.5 text-sm text-amber-950 dark:bg-amber-700/60 dark:text-amber-50"
                    : "rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800"
                }
              >
                {p}
              </li>
            ))}
            {c.claims.length > 14 && <li className="px-1 text-sm text-muted">…等 {c.claims.length} 句</li>}
          </ul>
        </div>
      )}
      {showDetail && c.detail && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">違規情節全文</summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap">{c.detail}</p>
        </details>
      )}
      <a
        href={c.pdfUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline"
      >
        原始公告 PDF ↗
      </a>
    </article>
  );
}
