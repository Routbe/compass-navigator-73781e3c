/**
 * Ghost Mode (stylometry masking) — shared rules. The sovereign model rewrites
 * the text server-side; `neutralizeStyle` is the deterministic fallback when
 * no model is configured or it does not answer in time, so the original
 * wording is never stored once Ghost Mode is on.
 */

export const STYLE_MASK_TIMEOUT_MS = 2000;

export const STYLE_MASK_SYSTEM_PROMPT =
  "Je bent een privacy-filter. Herschrijf het volgende bericht naar neutraal, grammaticaal correct Standaardnederlands. Verwijder alle sporen van specifieke schrijfstijlen, stopwoorden, overmatig emojigebruik, dialect en typfouten. Behoud de exacte kernboodschap en intentie, maar maak het onmogelijk om de oorspronkelijke afzender te profileren aan de hand van zinsbouw. Geef uitsluitend de herschreven tekst terug.";

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

/** Model output must be a single plain message: no quotes, no labels, within limits. */
export function cleanModelOutput(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/^["“”'`]+|["“”'`]+$/g, "").replace(/^(herschreven( tekst)?|rewritten|output)\s*:\s*/i, "").trim();
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trim() : s;
}
