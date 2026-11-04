import { cases, type Case } from "./data";
import { ALLOWED_PHRASES, RISK_RULES, type RiskCategory } from "./regulations";

export const MAX_INPUT = 4000;

export type RuleHit = {
  ruleId: string;
  label: string;
  category: RiskCategory;
  basis: string;
  match: string;
  start: number;
  end: number;
};

export type PhraseHit = {
  sentence: string;
  start: number;
  end: number;
  phrase: string;
  caseId: string;
  score: number;
};

export type SimilarCase = {
  id: string;
  score: number;
  matchedClaims: string[];
};

export type Analysis = {
  productType: "健康食品" | "一般食品";
  ruleHits: RuleHit[];
  phraseHits: PhraseHit[];
  allowed: { phrase: string; start: number }[];
  similar: SimilarCase[];
  ruleVerdict: "high" | "medium" | "low";
};

/** 全形英數轉半形，統一大小寫，方便比對 */
export function normalize(s: string) {
  return s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .toLowerCase();
}

function bigrams(s: string): Set<string> {
  const t = normalize(s).replace(/[\s\p{P}\p{S}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 依標點切句，保留每句在原文的位置 */
export function splitSentences(text: string) {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /[^。！？!?；;\n…]+/g;
  for (const m of text.matchAll(re)) {
    const s = m[0].trim();
    if (s.length < 2) continue;
    const start = m.index! + m[0].indexOf(s);
    out.push({ text: s, start, end: start + s.length });
  }
  return out;
}

// ---- 預先建好的索引（模組載入時算一次） ----

type ClaimEntry = { phrase: string; grams: Set<string>; caseId: string };

const claimIndex: ClaimEntry[] = cases.flatMap((c) =>
  c.claims
    .filter((p) => p.replace(/\s/g, "").length >= 4)
    .map((phrase) => ({ phrase, grams: bigrams(phrase), caseId: c.id })),
);

const caseVectors = (() => {
  const docs = cases.map((c) => [...bigrams([c.product, ...c.claims].join(" "))]);
  const df = new Map<string, number>();
  for (const d of docs) for (const g of d) df.set(g, (df.get(g) ?? 0) + 1);
  const n = docs.length;
  const idf = (g: string) => Math.log((n + 1) / ((df.get(g) ?? 0) + 1)) + 1;
  const vecs = docs.map((d) => {
    const v = new Map(d.map((g) => [g, idf(g)]));
    const norm = Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
    return { v, norm };
  });
  return { vecs, idf };
})();

// ---- 分析 ----

function findRuleHits(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of RISK_RULES) {
    for (const m of text.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      hits.push({
        ruleId: rule.id,
        label: rule.label,
        category: rule.category,
        basis: rule.basis,
        match: m[0],
        start: m.index!,
        end: m.index! + m[0].length,
      });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function findPhraseHits(text: string): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const s of splitSentences(text)) {
    const sg = bigrams(s.text);
    if (sg.size < 2) continue;
    let best: PhraseHit | null = null;
    for (const e of claimIndex) {
      if (e.grams.size < 3) continue;
      let common = 0;
      for (const g of e.grams) if (sg.has(g)) common++;
      // 被罰詞句有多少比例出現在這一句裡
      const score = common / e.grams.size;
      if (score >= 0.7 && (!best || score > best.score || (score === best.score && e.phrase.length > best.phrase.length))) {
        best = { sentence: s.text, start: s.start, end: s.end, phrase: e.phrase, caseId: e.caseId, score };
      }
    }
    if (best) hits.push(best);
  }
  return hits;
}

/**
 * 相似案例：以「被罰詞句」為單位，計算 IDF 加權的覆蓋率
 * （被罰詞句的字詞有多少出現在使用者文案裡，常見字詞權重低）。
 * 案例分數 = 最佳詞句覆蓋率 + 其他命中詞句的加分 + 整體 TF-IDF 相似度。
 */
function findSimilar(text: string, k = 6): SimilarCase[] {
  const q = bigrams(text);
  if (q.size === 0) return [];
  const { idf, vecs } = caseVectors;
  const qv = new Map([...q].map((g) => [g, idf(g)]));
  const qnorm = Math.sqrt([...qv.values()].reduce((a, b) => a + b * b, 0)) || 1;

  const scored = cases.map((c, i) => {
    const claimScores = c.claims
      .map((p) => {
        const g = bigrams(p);
        if (g.size < 2) return { p, r: 0 };
        let hit = 0;
        let all = 0;
        for (const x of g) {
          const w = idf(x);
          all += w;
          if (q.has(x)) hit += w;
        }
        return { p, r: hit / all };
      })
      .sort((a, b) => b.r - a.r);
    const best = claimScores[0]?.r ?? 0;
    const extra = claimScores.slice(1).filter((x) => x.r >= 0.6).length;

    let dot = 0;
    for (const [g, w] of qv) {
      const x = vecs[i].v.get(g);
      if (x) dot += w * x;
    }
    const cosine = dot / (qnorm * vecs[i].norm);

    return {
      id: c.id,
      score: best + 0.08 * Math.min(extra, 5) + cosine,
      matchedClaims: claimScores.filter((x) => x.r >= 0.5).slice(0, 5).map((x) => x.p),
    };
  });

  return scored
    .filter((s) => s.matchedClaims.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 }));
}

function findAllowed(text: string) {
  const n = normalize(text);
  return ALLOWED_PHRASES.flatMap((phrase) => {
    const i = n.indexOf(phrase);
    return i >= 0 ? [{ phrase, start: i }] : [];
  });
}

export function analyze(text: string): Analysis {
  const ruleHits = findRuleHits(text);
  const phraseHits = findPhraseHits(text);
  const medical = ruleHits.some((h) => h.category === "醫療效能");
  const ruleVerdict: Analysis["ruleVerdict"] =
    medical || phraseHits.length >= 2 ? "high" : ruleHits.length || phraseHits.length ? "medium" : "low";
  return {
    productType: /健食字|健食規字|健康食品認證|小綠人/.test(text) ? "健康食品" : "一般食品",
    ruleHits,
    phraseHits,
    allowed: findAllowed(text),
    similar: findSimilar(text),
    ruleVerdict,
  };
}

export function casesFor(ids: string[]): Case[] {
  const set = new Set(ids);
  return cases.filter((c) => set.has(c.id));
}
