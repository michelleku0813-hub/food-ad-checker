import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaseCard } from "@/components/CaseCard";
import { cases, dataset, formatMonth } from "@/lib/data";

export const metadata: Metadata = { title: "處罰案例庫｜食品廣告合規檢測" };

const PAGE_SIZE = 30;

type SP = PageProps<"/cases">["searchParams"];

export default function CasesPage({ searchParams }: PageProps<"/cases">) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">處罰案例庫</h1>
      <p className="mt-1 text-sm text-muted">
        臺北市政府衛生局每月公告的食品、健康食品違規廣告處罰案件，共 {dataset.cases.length} 件。
      </p>
      <Suspense fallback={<p className="mt-5 text-sm text-muted">載入中…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const month = typeof sp.month === "string" ? sp.month : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const filtered = cases.filter(
    (c) =>
      (!month || c.month === month) &&
      (!q || [c.product, c.company, c.detail, ...c.claims].some((s) => s.includes(q))),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalFine = filtered.reduce((sum, c) => sum + (c.fine ?? 0), 0);

  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (month) u.set("month", month);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/cases?${s}` : "/cases";
  };

  return (
    <>
      <form className="mt-5 flex flex-wrap gap-2" action="/cases">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜尋產品、業者或違規詞句，例如：益生菌、凍齡"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          name="month"
          defaultValue={month}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          aria-label="公告月份"
        >
          <option value="">全部月份</option>
          {dataset.months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white dark:text-neutral-950">搜尋</button>
      </form>

      <p className="mt-4 text-sm text-muted">
        符合 {filtered.length} 件，罰鍰合計 {totalFine.toLocaleString("zh-TW")} 元
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {shown.map((c) => (
          <CaseCard key={c.id} c={c} highlight={q ? c.claims.filter((p) => p.includes(q)) : []} showDetail />
        ))}
      </div>

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={href(page - 1)}>← 上一頁</Link> : <span className="text-muted">← 上一頁</span>}
          <span className="text-muted">
            {page} / {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)}>下一頁 →</Link> : <span className="text-muted">下一頁 →</span>}
        </nav>
      )}
    </>
  );
}
