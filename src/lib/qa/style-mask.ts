/**
 * Ghost Mode (stylometry masking) — shared rules. The sender presses the
 * magic wand before sending; `/api/ai/rewrite` asks a sovereign model and the
 * rewritten text lands back in the textarea, so the sender keeps full control
 * and decides when to send. The original is never stored anywhere.
 * `neutralizeStyle` is the deterministic fallback when the model is not
 * configured or does not answer in time.
 */

/** Exact privacy-filter instruction (user requirement). */
export const STYLE_MASK_SYSTEM_PROMPT =
  "Je bent een privacy-filter. Herschrijf de input van de gebruiker naar neutraal, grammaticaal correct Standaardnederlands. Verwijder stopwoorden, straattaal, dialect, unieke typfouten en overmatig emojigebruik. Behoud de exacte kernboodschap, maar wis de schrijfstijl-identiteit. Antwoord uitsluitend met de herschreven tekst, geen uitleg.";

/** Per visitor IP: at most 3 rewrites per minute, 20 per hour. */
export const REWRITE_RATE = { limit: 3, windowSec: 60 } as const;
export const REWRITE_RATE_HOURLY = { limit: 20, windowSec: 3600 } as const;

/** Time budget per attempt: the main model first, then the fast fallback model. */
export const REWRITE_PRIMARY_MS = 6000;
export const REWRITE_FALLBACK_MS = 4000;

/** Infomaniak (Swiss) models; overridable with SOVEREIGN_AI_MODEL / SOVEREIGN_AI_FALLBACK_MODEL. */
export const DEFAULT_SOVEREIGN_MODEL = "mistralai/Mistral-Small-4-119B-2603";
export const DEFAULT_SOVEREIGN_FALLBACK_MODEL = "mistralai/Ministral-3-14B-Instruct-2512";

export type SovereignEndpoint = {
  url: string;
  models: string[];
  /** Infomaniak accepts `reasoning_effort: "none"` to skip slow thinking. */
  infomaniak: boolean;
};

type SovereignEnv = {
  baseUrl?: string | null;
  productId?: string | null;
  model?: string | null;
  fallbackModel?: string | null;
};

/**
 * Any OpenAI-compatible endpoint via SOVEREIGN_AI_BASE_URL (https only), or
 * Infomaniak AI Tools built from INFOMANIAK_AI_PRODUCT_ID. Null = not configured.
 */
export function resolveSovereignEndpoint(env: SovereignEnv): SovereignEndpoint | null {
  const base = env.baseUrl?.trim();
  const id = env.productId?.trim();
  let url: string;
  if (base) {
    if (!/^https:\/\/[^\s/]+/i.test(base)) return null;
    url = `${base.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}/chat/completions`;
  } else if (id && /^\d{1,12}$/.test(id)) {
    url = `https://api.infomaniak.com/2/ai/${id}/openai/v1/chat/completions`;
  } else {
    return null;
  }
  const infomaniak = /^https:\/\/api\.infomaniak\.com\//i.test(url);
  const primary = env.model?.trim() || DEFAULT_SOVEREIGN_MODEL;
  const fallback = env.fallbackModel?.trim() || (infomaniak || !env.model?.trim() ? DEFAULT_SOVEREIGN_FALLBACK_MODEL : "");
  const models = [primary, fallback].filter((m, i, all) => m && all.indexOf(m) === i);
  return { url, models, infomaniak };
}

/** Chat shorthand that gives a writer away; expanded to plain words. */
const SHORTHAND: Record<string, string> = {
  wss: "waarschijnlijk", mss: "misschien", ff: "even", ofz: "of zo", idk: "ik weet het niet", iig: "in ieder geval",
  btw: "trouwens", wrm: "waarom", wnr: "wanneer", nie: "niet", ni: "niet", da: "dat", kweet: "ik weet", kheb: "ik heb",
  kben: "ik ben", kga: "ik ga", tis: "het is", "is't": "is het", u: "je",
  pls: "alsjeblieft", plz: "alsjeblieft", aub: "alsjeblieft", thx: "bedankt", ty: "bedankt", tmrw: "morgen",
};
/** Fillers carry style but no meaning. */
const FILLERS = /(?<!\p{L})(?:l+o+l+|h+a+(?:h+a+)+|x+d+|o+m+g+|bruh+|lmao+|lmfao+|haha\p{L}*|hihi\p{L}*|hehe\p{L}*|jeej|wtf|tbh|fr|ngl|ig)(?!\p{L})/giu;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function neutralizeStyle(raw: string): string {
  let s = raw.normalize("NFC").replace(EMOJI, " ");
  s = s.replace(FILLERS, " ");
  // Stretched letters (heeeel → heel) and repeated punctuation (!!!, ?!?).
  s = s.replace(/(\p{L})\1{2,}/gu, "$1$1");
  s = s.replace(/([!?.,])[!?.,]+/g, (_m, first: string) => (first === "," ? "," : first === "." ? "." : first));
  // Shouting → normal case; then expand shorthand word by word.
  s = s.replace(/\p{Lu}{3,}/gu, (w) => w.toLowerCase());
  s = s.replace(/[\p{L}']+/gu, (w) => {
    const lower = w.toLowerCase();
    return SHORTHAND[lower] ?? (w === w.toUpperCase() && w.length > 1 ? lower : w);
  });
  s = s.replace(/\s+([!?.,])/g, "$1").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += s.split(/\s+/)[0]?.match(/^(wie|wat|waar|wanneer|waarom|hoe|welke|ben|heb|is|kan|wil|zou|mag|do|are|who|what|why|how)$/i) ? "?" : ".";
  return s;
}

/** Model output must be a single plain message: no quotes, no labels, no thinking, within limits. */
export function cleanModelOutput(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^["“”'`]+|["“”'`]+$/g, "").replace(/^(herschreven( tekst)?|rewritten|output)\s*:\s*/i, "").trim();
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trim() : s;
}
