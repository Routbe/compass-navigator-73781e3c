import { useEffect, useId, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Dices, Loader2, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { askAnonymousQuestion, getQuestionAccess } from "@/lib/questions.functions";
import { QUESTION_MAX } from "@/lib/questions-rules";
import { needsNudge } from "@/lib/qa/nudge";
import { nextDiceIndex } from "@/lib/qa/prompts";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { QaSpace } from "./useQaPublic";

/** Profile-theme colors when embedded on a hub; tokens otherwise. */
export type QaTheme = { card: string; border: string; text: string; muted: string };

type Phase = "idle" | "masking" | "sending" | "sent";

const ERRORS: Record<string, string> = {
  invalid: "pages.qa.ask.invalid",
  not_found: "pages.qa.ask.closed",
  restricted: "pages.qa.ask.restricted",
  too_many: "pages.qa.ask.tooMany",
};

/**
 * Anonymous send form. Muted or banned senders see exactly the same success
 * state as everyone else — the server answers "ok" either way.
 */
export function QaAskForm({ handle, space, headline, theme, size = "page" }: {
  handle: string;
  space: QaSpace;
  headline: string;
  theme?: QaTheme;
  size?: "page" | "hub";
}) {
  const { t } = useI18n();
  const ask = useServerFn(askAnonymousQuestion);
  const access = useQuery({
    queryKey: ["qa-access", space, handle.toLowerCase()],
    queryFn: () => getQuestionAccess({ data: { handle, space } }),
    staleTime: 60_000,
  });
  const [body, setBody] = useState("");
  const [ghost, setGhost] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dice, setDice] = useState<number | null>(null);
  const ghostHelpId = useId();
  const nudgeId = useId();
  const nudge = needsNudge(body);
  const locked = access.data ? !access.data.canSend : false;
  const big = size === "page";

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = window.setTimeout(() => setPhase("idle"), 3200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || phase === "sending" || phase === "masking") return;
    setError(null);
    setPhase(ghost ? "masking" : "sending");
    try {
      const { result } = await ask({ data: { handle, space, body, ghost } });
      if (result === "ok") {
        setBody("");
        setPhase("sent");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([10]);
      } else {
        setPhase("idle");
        setError(t(ERRORS[result] ?? "pages.qa.ask.failed"));
      }
    } catch {
      setPhase("idle");
      setError(t("pages.qa.ask.failed"));
    }
  };

  const rollDice = () => {
    const i = nextDiceIndex(dice);
    setDice(i);
    setBody(t(`pages.qa.dice.${i + 1}`));
  };

  const card: CSSProperties | undefined = theme ? { background: theme.card, border: `1px solid ${theme.border}`, color: theme.text } : undefined;
  const muted: CSSProperties | undefined = theme ? { color: theme.muted } : undefined;
  const line: CSSProperties | undefined = theme ? { border: `1px solid ${theme.border}` } : undefined;

  if (locked) {
    return (
      <div role="status" className={cn("rounded-3xl p-5 text-sm", !theme && "border border-border bg-card text-muted-foreground")} style={card}>
        <p style={muted}>{access.data?.level === "disabled" ? t("pages.qa.ask.closed") : t("pages.qa.ask.restricted")}</p>
      </div>
    );
  }

  const busy = phase === "sending" || phase === "masking";
  return (
    <form onSubmit={submit} className="w-full" aria-label={headline}>
      <div className={cn("overflow-hidden shadow-xl", big ? "rounded-[28px]" : "rounded-2xl", !theme && "bg-story-card text-story-ink")} style={card}>
        <div className={cn("bg-gradient-to-br from-story-ring to-story-ring-2 text-story-card", big ? "px-6 pb-5 pt-6" : "px-4 pb-3 pt-4")}>
          <p className={cn("font-display leading-tight", big ? "text-3xl" : "text-xl")}>{headline}</p>
        </div>
        <div className={cn("relative", big ? "p-5" : "p-3")}>
          <label className="sr-only" htmlFor={`${nudgeId}-msg`}>{headline}</label>
          <textarea
            id={`${nudgeId}-msg`}
            value={body}
            onChange={(e) => { setBody(e.target.value.slice(0, QUESTION_MAX)); setError(null); }}
            maxLength={QUESTION_MAX}
            rows={big ? 4 : 3}
            placeholder={t("pages.qa.ask.placeholder")}
            aria-describedby={nudge ? nudgeId : undefined}
            className={cn("w-full resize-none bg-transparent outline-none placeholder:opacity-50", big ? "text-lg" : "text-sm")}
            disabled={busy}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-70">
            <button type="button" onClick={rollDice} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-medium transition-transform active:scale-95" style={line} aria-label={t("pages.qa.ask.dice")}>
              <Dices className="h-4 w-4" aria-hidden /> {big && t("pages.qa.ask.dice")}
            </button>
            <span aria-live="polite">{body.length}/{QUESTION_MAX}</span>
          </div>
        </div>
      </div>

      <div className={cn("mt-3 flex items-start gap-3 rounded-2xl px-4 py-3", !theme && "border border-border bg-card/60")} style={line}>
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("pages.qa.ask.ghost")}</p>
          <p id={ghostHelpId} className={cn("text-xs", !theme && "text-muted-foreground")} style={muted}>{t("pages.qa.ask.ghostHelp")}</p>
        </div>
        <Switch checked={ghost} onCheckedChange={setGhost} aria-label={t("pages.qa.ask.ghost")} aria-describedby={ghostHelpId} />
      </div>

      {nudge && (
        <p id={nudgeId} role="status" className="mt-3 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>{t("pages.qa.ask.nudge")}</span>
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={busy || (!body.trim() && phase !== "sent")}
        className={cn(
          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 active:scale-[0.98] disabled:opacity-60",
          big ? "min-h-14 text-base" : "min-h-11 text-sm",
          phase === "sent" ? "bg-story-ring text-story-card" : "bg-foreground text-background",
        )}
        aria-live="polite"
      >
        {phase === "sent" ? (
          <><Check className="qa-sent-pop h-5 w-5" aria-hidden /> {t("pages.qa.ask.sent")}</>
        ) : busy ? (
          <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {phase === "masking" ? t("pages.qa.ask.masking") : t("pages.qa.ask.sending")}</>
        ) : (
          t("pages.qa.ask.send")
        )}
      </button>
      <p className={cn("mt-2 flex items-center justify-center gap-1.5 text-center text-xs", !theme && "text-muted-foreground")} style={muted}>
        <Lock className="h-3 w-3" aria-hidden /> {t("pages.qa.ask.anonymous")}
      </p>
    </form>
  );
}
