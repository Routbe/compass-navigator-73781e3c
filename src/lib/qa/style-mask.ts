/**
 * Ghost Mode (stylometry masking) — shared rules. The sender presses the
 * magic wand before sending; `/api/ai/rewrite` asks a sovereign model and the
 * rewritten text lands back in the textarea, so the sender keeps full control
 * and decides when to send. The original is never stored anywhere.
 * `neutralizeStyle` is the deterministic fallback when the model is not
 * configured or does not answer in time.
 */

/** Exact privacy-filter instruction (user requirement): keeps the source language. */
export const STYLE_MASK_SYSTEM_PROMPT =
  "You are a privacy-preserving stylometry filter. First, detect the language of the user's input. Then, rewrite the text to a neutral, grammatically correct standard version in THAT EXACT SAME LANGUAGE. Strip away unique writing styles, slang, dialect, typos, and excessive emojis. Preserve the exact core message and intent. DO NOT translate the text to another language. Output ONLY the rewritten text, nothing else.";

/** UI languages the rewrite accepts as a hint for ambiguous input. */
export const REWRITE_UI_LANGUAGES = ["nl", "en", "fr", "de"] as const;
export type RewriteUiLanguage = (typeof REWRITE_UI_LANGUAGES)[number];

export function isRewriteUiLanguage(v: unknown): v is RewriteUiLanguage {
  return typeof v === "string" && (REWRITE_UI_LANGUAGES as readonly string[]).includes(v);
}

/** System prompt plus the UI-language tie-breaker (only for a known UI language). */
export function buildRewritePrompt(uiLanguage?: string | null): string {
  if (!isRewriteUiLanguage(uiLanguage)) return STYLE_MASK_SYSTEM_PROMPT;
  return `${STYLE_MASK_SYSTEM_PROMPT} The user is currently browsing the site in ${uiLanguage}. If the input language is ambiguous, default to standardizing it in ${uiLanguage}.`;
}

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

/** Chat shorthand that gives a writer away, per language; expanded to plain words. */
const SHORTHAND: Record<RewriteUiLanguage, Record<string, string>> = {
  nl: {
    wss: "waarschijnlijk", mss: "misschien", ff: "even", ofz: "of zo", idk: "ik weet het niet", iig: "in ieder geval",
    btw: "trouwens", wrm: "waarom", wnr: "wanneer", nie: "niet", ni: "niet", da: "dat", kweet: "ik weet", kheb: "ik heb",
    kben: "ik ben", kga: "ik ga", tis: "het is", "is't": "is het", u: "je",
    pls: "alsjeblieft", plz: "alsjeblieft", aub: "alsjeblieft", thx: "bedankt", ty: "bedankt", tmrw: "morgen",
  },
  en: {
    idk: "I don't know", u: "you", ur: "your", r: "are", ya: "you", pls: "please", plz: "please", thx: "thanks", ty: "thank you",
    tmrw: "tomorrow", btw: "by the way", gonna: "going to", wanna: "want to", gotta: "have to", cuz: "because", bc: "because",
    rn: "right now", im: "I'm", dont: "don't", cant: "can't", nvm: "never mind", omw: "on my way",
  },
  fr: {
    slt: "salut", stp: "s'il te plaît", svp: "s'il vous plaît", pk: "pourquoi", pq: "pourquoi", jsp: "je ne sais pas",
    tkt: "ne t'inquiète pas", bcp: "beaucoup", cv: "ça va", jtm: "je t'aime", dsl: "désolé", mtn: "maintenant",
    tjrs: "toujours", qd: "quand", pr: "pour", ptn: " ", mdr: " ", ptdr: " ",
  },
  de: {
    vllt: "vielleicht", ka: "keine Ahnung", kp: "keine Ahnung", hdl: "hab dich lieb", lg: "liebe Grüße", mfg: "mit freundlichen Grüßen",
    gn: "gute Nacht", wg: "wegen", nix: "nichts", net: "nicht", nen: "einen", ne: "eine", isses: "ist es",
  },
};

/** Common words per language, for the offline fallback only (the model detects language itself). */
const STOPWORDS: Record<RewriteUiLanguage, string[]> = {
  nl: ["ik", "je", "jij", "het", "een", "niet", "wat", "waarom", "dat", "da", "en", "ook", "zijn", "heb", "wss", "mss", "ofz", "nie", "ni", "kben", "kheb"],
  en: ["i", "you", "the", "is", "are", "what", "why", "and", "not", "this", "that", "u", "ur", "idk", "gonna", "wanna", "im", "dont"],
  fr: ["je", "tu", "le", "la", "les", "est", "pas", "pourquoi", "et", "que", "qui", "ça", "c'est", "slt", "jsp", "pk", "tkt", "mdr", "bcp"],
  de: ["ich", "du", "der", "die", "das", "ist", "nicht", "warum", "und", "was", "auch", "bist", "vllt", "nix", "net", "isses"],
};

/** Best-effort language guess for the local fallback; ties go to the UI language. */
export function guessLanguage(text: string, uiLanguage?: string | null): RewriteUiLanguage {
  const ui: RewriteUiLanguage = isRewriteUiLanguage(uiLanguage) ? uiLanguage : "nl";
  const words: string[] = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  let best: RewriteUiLanguage = ui;
  let bestScore = 0;
  for (const lang of REWRITE_UI_LANGUAGES) {
    const set = STOPWORDS[lang];
    const score = words.filter((w) => set.includes(w)).length;
    if (score > bestScore || (score === bestScore && score > 0 && lang === ui)) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

const QUESTION_STARTS: Record<RewriteUiLanguage, RegExp> = {
  nl: /^(wie|wat|waar|wanneer|waarom|hoe|welke|ben|heb|is|kan|wil|zou|mag)$/i,
  en: /^(who|what|where|when|why|how|which|do|does|did|are|is|can|will|would|should|have)$/i,
  fr: /^(qui|quoi|où|quand|pourquoi|comment|quel|quelle|est-ce|es-tu|as-tu|peux-tu)$/i,
  de: /^(wer|was|wo|wann|warum|wie|welche|bist|hast|ist|kannst|willst|magst)$/i,
};

/** Fillers carry style but no meaning. */
const FILLERS = /(?<!\p{L})(?:l+o+l+|h+a+(?:h+a+)+|x+d+|o+m+g+|bruh+|lmao+|lmfao+|haha\p{L}*|hihi\p{L}*|hehe\p{L}*|jeej|wtf|tbh|fr|ngl|ig|mdr+|ptdr+|xptdr|lel)(?!\p{L})/giu;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Offline fallback: language-aware shorthand, emoji, fillers, stretching, shouting. Never translates. */
export function neutralizeStyle(raw: string, uiLanguage?: string | null): string {
  const lang = guessLanguage(raw, uiLanguage);
  const table = SHORTHAND[lang];
  let s = raw.normalize("NFC").replace(EMOJI, " ");
  s = s.replace(FILLERS, " ");
  // Stretched letters (heeeel → heel) and repeated punctuation (!!!, ?!?).
  s = s.replace(/(\p{L})\1{2,}/gu, "$1$1");
  s = s.replace(/([!?.,])[!?.,]+/g, (_m, first: string) => (first === "," ? "," : first === "." ? "." : first));
  // Shouting → normal case; then expand shorthand word by word.
  s = s.replace(/\p{Lu}{3,}/gu, (w) => w.toLowerCase());
  s = s.replace(/[\p{L}']+/gu, (w) => {
    const lower = w.toLowerCase();
    return table[lower] ?? (w === w.toUpperCase() && w.length > 1 ? lower : w);
  });
  s = s.replace(/\s+([!?.,])/g, "$1").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (lang === "en") s = s.replace(/(?<!\p{L})i(?!\p{L})/gu, "I");
  if (!/[.!?]$/.test(s)) s += QUESTION_STARTS[lang].test(s.split(/\s+/)[0] ?? "") ? "?" : ".";
  return s;
}

/** Model output must be a single plain message: no quotes, no labels, no thinking, within limits. */
export function cleanModelOutput(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^["“”'`]+|["“”'`]+$/g, "").replace(/^(herschreven( tekst)?|rewritten( text)?|texte réécrit|umgeschriebener text|output)\s*:\s*/i, "").trim();
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trim() : s;
}
