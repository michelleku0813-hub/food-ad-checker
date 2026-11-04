"use client";

import { useMemo, useRef, useState } from "react";
import { CaseCard } from "@/components/CaseCard";
import type { Analysis } from "@/lib/analyze";
import type { Case } from "@/lib/format";
import type { Judgment } from "@/lib/judge";

type CaseLite = Omit<Case, "detail">;
type Verdict = "high" | "medium" | "low";

const MAX = 4000;

const SAMPLES = [
  {
    label: "範例：高風險",
    text: "【暢快益生菌】每天一包，有效改善便秘、腸躁症狀！還能降低膽固醇、增強免疫力。醫師推薦，30天見效，無效退費。",
  },
  {
    label: "範例：有疑慮",
    text: "水光膠原飲，一天一瓶喝出透亮肌。抗老凍齡，讓肌膚緊緻有彈性，細紋不見了，閨蜜都問我是不是去打針！",
  },
  {
    label: "範例：低風險",
    text: "嚴選台灣在地小農黑豆，低溫烘焙，香氣濃郁。營養補給好選擇，幫助消化，適合忙碌上班族當作早餐搭配。",
  },
];

const VERDICT: Record<Verdict, { label: string; desc: string; cls: string; dot: string }> = {
  high: {
    label: "高度可能違規",
    desc: "文案含有與處罰案例相近或涉及醫療效能的用語，刊登前務必修改。",
    cls: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
    dot: "bg-red-500",
  },
  medium: {
    label: "有疑慮，建議修改",
    desc: "部分用語可能被認定為誇張或易生誤解。",
    cls: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  low: {
    label: "未發現明顯違規用語",
    desc: "仍須依整體表現（圖片、影音、品名）綜合判斷，不代表一定合法。",
    cls: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
};

type Span = { start: number; end: number; level: "red" | "amber"; note: string };

function buildSpans(text: string, a: Analysis, j: Judgment | null): Span[] {
  const spans: Span[] = [];
  for (const h of a.ruleHits) {
    spans.push({ start: h.start, end: h.end, level: h.category === "醫療效能" ? "red" : "amber", note: h.label });
  }
  for (const h of a.phraseHits) {
    spans.push({ start: h.start, end: h.end, level: "amber", note: `近似處罰案例 ${h.caseId}` });
  }
  for (const i of j?.issues ?? []) {
    const idx = text.indexOf(i.quote);
    if (idx >= 0) {
      spans.push({
        start: idx,
        end: idx + i.quote.length,
        level: i.category === "醫療效能" ? "red" : "amber",
        note: i.reason,
      });
    }
  }
  return spans;
}

function Highlighted({ text, spans }: { text: string; spans: Span[] }) {
  // 每個字元取最嚴重的標記，再合併成區段
  const level: (Span | null)[] = Array(text.length).fill(null);
  for (const s of spans) {
    for (let i = s.start; i < s.end && i < text.length; i++) {
      const cur = level[i];
      if (!cur || (cur.level === "amber" && s.level === "red")) level[i] = s;
    }
  }
  const parts: { text: string; span: Span | null }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.span === level[i]) last.text += text[i];
    else parts.push({ text: text[i], span: level[i] });
  }
  return (
    <p className="leading-loose whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.span ? (
          <mark
            key={i}
            title={p.span.note}
            className={
              p.span.level === "red"
                ? "rounded bg-red-200 px-0.5 text-red-950 dark:bg-red-800/70 dark:text-red-50"
                : "rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-700/60 dark:text-amber-50"
            }
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <span className="text-xs text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Checker() {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [caseList, setCaseList] = useState<CaseLite[]>([]);
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const runId = useRef(0);

  const caseMap = useMemo(() => new Map(caseList.map((c) => [c.id, c])), [caseList]);

  async function run() {
    const input = text.trim();
    if (!input) return;
    const id = ++runId.current;
    setError(null);
    setAiError(null);
    setJudgment(null);
    setAnalysis(null);
    setChecked(input);
    setJudging(true);

    const body = JSON.stringify({ text: input });
    const headers = { "content-type": "application/json" };

    try {
      const r = await fetch("/api/analyze", { method: "POST", headers, body });
      const data = await r.json();
      if (id !== runId.current) return;
      if (!r.ok) throw new Error(data.error ?? "分析失敗");
      setAnalysis(data.analysis);
      setCaseList(data.cases);
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof Error ? e.message : "分析失敗");
      setJudging(false);
      return;
    }

    try {
      const r = await fetch("/api/judge", { method: "POST", headers, body });
      const data = await r.json();
      if (id !== runId.current) return;
      if (!r.ok) throw new Error(data.error);
      setJudgment(data.judgment);
    } catch (e) {
      if (id !== runId.current) return;
      setAiError(e instanceof Error && e.message ? e.message : "AI 判斷暫時無法使用。");
    } finally {
      if (id === runId.current) setJudging(false);
    }
  }

  const verdict: Verdict | null = judgment?.verdict ?? analysis?.ruleVerdict ?? null;
  const spans = analysis ? buildSpans(checked, analysis, judgment) : [];
  const phraseByCase = new Map<string, string[]>();
  for (const h of analysis?.phraseHits ?? []) {
    phraseByCase.set(h.caseId, [...(phraseByCase.get(h.caseId) ?? []), h.phrase]);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">食品廣告文案檢測</h1>
      <p className="mt-1 text-sm text-muted">
        貼上食品或健康食品的行銷文案，系統會比對臺北市衛生局的實際處罰案例與《認定準則》，標出可能違規的詞句。
      </p>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <label htmlFor="copy" className="sr-only">
          行銷文案
        </label>
        <textarea
          id="copy"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={7}
          placeholder="例如：每天一包益生菌，幫助消化、使排便順暢…"
          className="w-full resize-y bg-transparent leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.text)}
              className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent hover:text-accent"
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted">
            {text.length} / {MAX}
          </span>
          <button
            type="button"
            onClick={run}
            disabled={!text.trim() || (judging && checked === text.trim())}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:text-neutral-950"
          >
            開始檢測
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}

      {analysis && verdict && (
        <>
          <div className={`mt-6 rounded-xl border p-4 ${VERDICT[verdict].cls}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${VERDICT[verdict].dot}`} />
              <span className="text-lg font-semibold">{VERDICT[verdict].label}</span>
              <span className="text-xs opacity-75">
                {judgment ? "AI 綜合判斷" : judging ? "規則初判，AI 判斷中…" : "規則初判"}
              </span>
              {judgment && <span className="ml-auto text-xs opacity-75">產品類型：{judgment.productType}</span>}
            </div>
            <p className="mt-2 text-sm leading-relaxed">{judgment?.summary ?? VERDICT[verdict].desc}</p>
          </div>

          {aiError && <p className="mt-3 text-sm text-muted">{aiError}</p>}

          <Section title="文案標示" aside="紅色：涉及醫療效能　黃色：誇張或易生誤解">
            <div className="rounded-xl border border-line bg-surface p-4">
              <Highlighted text={checked} spans={spans} />
            </div>
          </Section>

          {judging && !judgment && (
            <Section title="逐句問題與修改建議">
              <div className="animate-pulse rounded-xl border border-line bg-surface p-4 text-sm text-muted">
                AI 正在對照法規與案例逐句審查，約需 10～30 秒…
              </div>
            </Section>
          )}

          {judgment && judgment.issues.length > 0 && (
            <Section title="逐句問題與修改建議" aside={`${judgment.issues.length} 處`}>
              <ol className="space-y-3">
                {judgment.issues.map((i, n) => (
                  <li key={n} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={
                          i.category === "醫療效能"
                            ? "rounded bg-red-100 px-1.5 py-0.5 text-red-800 dark:bg-red-900/60 dark:text-red-200"
                            : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                        }
                      >
                        {i.category}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{i.law}</span>
                    </div>
                    <p className="mt-2 font-medium">「{i.quote}」</p>
                    <p className="mt-1 text-sm leading-relaxed">{i.reason}</p>
                    <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm leading-relaxed text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
                      建議改寫：{i.suggestion}
                    </p>
                    {i.relatedCaseIds.length > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        參考案例：
                        {i.relatedCaseIds.map((cid) => (
                          <a key={cid} href={`#${cid}`} className="mr-2 font-mono text-accent hover:underline">
                            {cid}
                            {caseMap.get(cid) ? `（${caseMap.get(cid)!.product.slice(0, 16)}）` : ""}
                          </a>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {judgment.okPoints.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm">
                  <p className="font-medium">沒有問題的部分</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                    {judgment.okPoints.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          <Section title="規則比對">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-medium">準則風險詞</p>
                {analysis.ruleHits.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {analysis.ruleHits.map((h, i) => (
                      <li key={i}>
                        <span className={h.category === "醫療效能" ? "font-medium text-red-700 dark:text-red-300" : "font-medium text-amber-700 dark:text-amber-300"}>
                          {h.match}
                        </span>
                        <span className="text-muted">　{h.label}（{h.basis}）</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">沒有命中</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-medium">近似處罰案例的詞句</p>
                {analysis.phraseHits.length ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {analysis.phraseHits.map((h, i) => (
                      <li key={i}>
                        <span className="text-muted">被罰：</span>「{h.phrase}」
                        <a href={`#${h.caseId}`} className="ml-1 font-mono text-xs text-accent hover:underline">
                          {h.caseId}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">沒有高度相似的句子</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-medium">準則允許詞句</p>
                {analysis.allowed.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
                    {analysis.allowed.map((a) => (
                      <li key={a.phrase} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">
                        {a.phrase}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">沒有使用附件一詞句</p>
                )}
                <p className="mt-2 text-xs text-muted">出自《認定準則》附件一，單獨使用通常不違規。</p>
              </div>
            </div>
          </Section>

          {analysis.similar.length > 0 && (
            <Section title="最相似的處罰案例" aside="依用詞相似度排序">
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.similar.map((s) => {
                  const c = caseMap.get(s.id);
                  return c ? (
                    <CaseCard key={s.id} c={c} highlight={[...s.matchedClaims, ...(phraseByCase.get(s.id) ?? [])]} />
                  ) : null;
                })}
              </div>
            </Section>
          )}

          {[...phraseByCase.keys()].filter((id) => !analysis.similar.some((s) => s.id === id)).length > 0 && (
            <Section title="其他相關案例">
              <div className="grid gap-3 md:grid-cols-2">
                {[...phraseByCase.keys()]
                  .filter((id) => !analysis.similar.some((s) => s.id === id))
                  .map((id) => {
                    const c = caseMap.get(id);
                    return c ? <CaseCard key={id} c={c} highlight={phraseByCase.get(id)} /> : null;
                  })}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
