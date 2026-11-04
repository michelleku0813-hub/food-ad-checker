import type { Metadata } from "next";
import Link from "next/link";
import { dataset, formatMonth } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "食品廣告合規檢測",
  description: "以臺北市政府衛生局食品、健康食品違規廣告處罰案例為依據，檢查行銷文案是否涉及違規。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const months = dataset.months;
  return (
    <html lang="zh-Hant-TW" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              食品廣告合規檢測
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:text-accent">
                文案檢測
              </Link>
              <Link href="/cases" className="hover:text-accent">
                處罰案例庫
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line text-xs text-muted">
          <div className="mx-auto max-w-5xl space-y-1 px-4 py-4">
            <p>
              資料來源：
              <a href={dataset.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                {dataset.source}
              </a>
              ，收錄 {formatMonth(months[months.length - 1])}～{formatMonth(months[0])}，共 {dataset.cases.length} 件。
            </p>
            <p>本工具僅供刊登前自我檢查參考，不構成法律意見；實際認定以主管機關為準。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
