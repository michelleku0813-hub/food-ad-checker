import { generateText, Output } from "ai";
import { z } from "zod";
import { type Analysis, casesFor } from "./analyze";
import { caseById, formatFine, shortLaw } from "./data";
import { ALLOWED_PHRASES, LAWS } from "./regulations";

export const MODEL = "anthropic/claude-sonnet-5.5";

export const judgmentSchema = z.object({
  verdict: z
    .enum(["high", "medium", "low"])
    .describe("high=高度可能違規；medium=有疑慮、建議修改；low=未發現明顯違規"),
  summary: z.string().describe("兩三句話的整體判斷，說明主要風險在哪"),
  productType: z.enum(["一般食品", "健康食品", "無法判斷"]),
  issues: z
    .array(
      z.object({
        quote: z.string().describe("文案中有問題的片段，必須逐字摘錄自原文"),
        category: z.enum(["醫療效能", "不實誇張易生誤解", "超出健康食品許可範圍", "引用公文書字號"]),
        reason: z.string().describe("為什麼有問題，對照準則哪一款"),
        law: z.string().describe("可能違反的法條，例如：食安法 §28 I、食安法 §28 II、健康食品管理法 §14"),
        relatedCaseIds: z.array(z.string()).describe("參考案例的 id，只能使用提供的案例 id，沒有就給空陣列"),
        suggestion: z.string().describe("建議改寫成什麼，盡量使用準則允許的詞句"),
      }),
    )
    .describe("依嚴重程度排序"),
  okPoints: z.array(z.string()).describe("文案中寫法沒有問題的部分，可為空"),
});

export type Judgment = z.infer<typeof judgmentSchema>;

const SYSTEM = `你是臺灣食品廣告法規的審查助理，協助使用者在刊登前自我檢查行銷文案。
判斷依據：
${Object.entries(LAWS)
  .map(([k, v]) => `【${k}】${v}`)
  .join("\n")}

【認定準則附件一：通常可使用之詞句】${ALLOWED_PHRASES.join("、")}

判斷原則：
1. 依「整體表現」判斷，不是只看單一關鍵字。允許詞句若搭配誇大情境、前後對照或疾病暗示，仍可能違規。
2. 涉及疾病、症狀、或降低致病體內成分（血糖、血壓、膽固醇等）→ 醫療效能（食安法 §28 II，罰則較重）。
3. 涉及維持或改變器官、組織、生理或外觀功能 → 不實誇張易生誤解（食安法 §28 I）。
4. 健康食品只能宣稱核准的保健功效，超出範圍或誇大 → 健康食品管理法 §14。
5. 台北市實際處罰案例是最重要的參考：若文案用語與被罰案例相近，要明確指出並引用案例 id。
6. 不可以斷言「合法」。沒有發現問題時，用 low 並說明「未發現明顯違規用語」。
7. quote 必須逐字摘錄自使用者文案，不要改寫、不要加省略號。
8. 使用臺灣繁體中文，語氣直接、具體。`;

function describeCase(id: string) {
  const c = caseById.get(id);
  if (!c) return "";
  return `- [${c.id}] ${c.date}｜${c.product}｜${c.source}｜${shortLaw(c.law)}｜罰 ${formatFine(c.fine)}｜被罰詞句：${c.claims
    .slice(0, 12)
    .join("／")}`;
}

export function buildPrompt(text: string, a: Analysis) {
  const relatedIds = [...new Set([...a.phraseHits.map((h) => h.caseId), ...a.similar.map((s) => s.id)])];
  const ruleLines = a.ruleHits.length
    ? a.ruleHits.map((h) => `- 「${h.match}」：${h.label}（${h.basis}）`).join("\n")
    : "（無）";
  const phraseLines = a.phraseHits.length
    ? a.phraseHits.map((h) => `- 文案句子「${h.sentence}」近似被罰詞句「${h.phrase}」（案例 ${h.caseId}）`).join("\n")
    : "（無）";
  const allowedLines = a.allowed.length ? a.allowed.map((x) => x.phrase).join("、") : "（無）";

  return `請審查以下食品行銷文案。

<文案>
${text}
</文案>

系統初步判斷產品類型：${a.productType}

規則比對命中的風險詞：
${ruleLines}

與台北市處罰案例詞句高度相似的句子：
${phraseLines}

文案中出現的準則附件一允許詞句：${allowedLines}

最相似的台北市處罰案例（只能引用這些 id）：
${casesFor(relatedIds).map((c) => describeCase(c.id)).join("\n") || "（無）"}

規則比對只是線索，可能有誤判或漏判，請依整體表現做最後判斷。`;
}

export async function judge(text: string, a: Analysis): Promise<Judgment> {
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    prompt: buildPrompt(text, a),
    output: Output.object({ schema: judgmentSchema }),
  });
  const allowedIds = new Set([...a.phraseHits.map((h) => h.caseId), ...a.similar.map((s) => s.id)]);
  return {
    ...output,
    issues: output.issues.map((i) => ({
      ...i,
      relatedCaseIds: i.relatedCaseIds.filter((id) => allowedIds.has(id) && caseById.has(id)),
    })),
  };
}
