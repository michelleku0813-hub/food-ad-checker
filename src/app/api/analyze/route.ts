import { analyze, casesFor, MAX_INPUT } from "@/lib/analyze";

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "請輸入文案內容" }, { status: 400 });
  }
  if (text.length > MAX_INPUT) {
    return Response.json({ error: `文案過長，請控制在 ${MAX_INPUT} 字以內` }, { status: 400 });
  }
  const analysis = analyze(text);
  const ids = [...new Set([...analysis.phraseHits.map((h) => h.caseId), ...analysis.similar.map((s) => s.id)])];
  // 違規情節全文很長，前端只需要摘要欄位
  const related = casesFor(ids).map((c) => ({ ...c, detail: undefined }));
  return Response.json({ analysis, cases: related });
}
