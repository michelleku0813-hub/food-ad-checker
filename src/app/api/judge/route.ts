import { analyze, MAX_INPUT } from "@/lib/analyze";
import { judge } from "@/lib/judge";

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string" || !text.trim() || text.length > MAX_INPUT) {
    return Response.json({ error: "文案內容不正確" }, { status: 400 });
  }
  try {
    const judgment = await judge(text, analyze(text));
    return Response.json({ judgment });
  } catch (err) {
    console.error("[judge]", err);
    return Response.json(
      { error: "AI 判斷暫時無法使用，以下僅顯示規則比對與相似案例結果。" },
      { status: 502 },
    );
  }
}
