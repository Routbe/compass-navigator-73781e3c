/**
 * Ghost Mode rewrite through a sovereign (European) OpenAI-compatible endpoint.
 * Configure SOVEREIGN_AI_BASE_URL + SOVEREIGN_AI_API_KEY (+ SOVEREIGN_AI_MODEL).
 * Never throws and never returns the original text: on any failure or after
 * the 2-second budget the deterministic neutralizer is used instead.
 */
import { QUESTION_MAX } from "@/lib/questions-rules";
import { STYLE_MASK_SYSTEM_PROMPT, STYLE_MASK_TIMEOUT_MS, cleanModelOutput, neutralizeStyle } from "./style-mask";

export type MaskResult = { text: string; via: "sovereign" | "local" };

function local(text: string): MaskResult {
  return { text: neutralizeStyle(text).slice(0, QUESTION_MAX), via: "local" };
}

export async function maskWritingStyle(text: string): Promise<MaskResult> {
  const key = process.env["SOVEREIGN_AI_API_KEY"]?.trim();
  const base = process.env["SOVEREIGN_AI_BASE_URL"]?.trim();
  if (!key || !base || !/^https:\/\//.test(base)) return local(text);
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(STYLE_MASK_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env["SOVEREIGN_AI_MODEL"]?.trim() || "mistral24b",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: STYLE_MASK_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[qa] style mask provider refused", { status: res.status });
      return local(text);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const out = cleanModelOutput(json.choices?.[0]?.message?.content, QUESTION_MAX);
    return out ? { text: out, via: "sovereign" } : local(text);
  } catch {
    return local(text);
  }
}
