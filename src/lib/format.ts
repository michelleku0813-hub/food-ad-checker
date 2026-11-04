// 這個檔案不能 import 案例資料，前端元件會用到它。

export type Case = {
  id: string;
  month: string;
  date: string;
  product: string;
  source: string;
  company: string;
  fine: number | null;
  law: string;
  category: "醫療效能" | "不實誇張易生誤解";
  productType: "一般食品" | "健康食品";
  claims: string[];
  detail: string;
  pdfTitle: string;
  pdfUrl: string;
};

/** "115-10" → "115年10月" */
export function formatMonth(m: string) {
  const [y, mm] = m.split("-");
  return `${y}年${Number(mm)}月`;
}

export function formatFine(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString("zh-TW")} 元`;
}

/** 食品安全衛生管理法(103.02.5修正公布)第28條第1項 → 食安法 §28 I */
export function shortLaw(law: string) {
  const name = law.includes("健康食品管理法") ? "健康食品管理法" : law.includes("食品安全衛生管理法") ? "食安法" : law;
  const m = law.match(/第(\d+)條(?:第(\d+)項)?/);
  if (!m) return name;
  const roman = ["", "I", "II", "III", "IV", "V"][Number(m[2] ?? 0)] ?? m[2];
  return `${name} §${m[1]}${roman ? ` ${roman}` : ""}`;
}
