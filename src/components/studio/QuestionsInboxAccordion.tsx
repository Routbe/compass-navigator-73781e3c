import { useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QA_PROMPT_CUSTOM_MAX, QA_PROMPT_KEYS, promptHeadline, type QaPromptKey } from "@/lib/qa/prompts";
import { QaInbox } from "@/components/qa/QaInbox";
import { QaMutedList } from "@/components/qa/QaMutedList";
import { QaShareDialog } from "@/components/qa/QaShareDialog";
import { qaPaths, type QaSpace } from "@/components/qa/useQaPublic";
import { cn } from "@/lib/utils";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import { StudioSectionIcon } from "./StudioSectionIcon";

export type QaPrefs = Pick<ProfileDisplayPrefs, "questionsEnabled" | "qaPrompt" | "qaPromptCustom" | "qaOnHub" | "qaPage">;

/**
 * Studio: anonymous Q&A for one canvas — accept on/off, hub block and/or a
 * dedicated /ask page, the NGL-style prompt, the story-card generator and the
 * Void Inbox. Settings are profile prefs, so they go live on publish.
 */
export function QuestionsInboxAccordion({ space, handle, displayName, avatarUrl, prefs, onPref }: {
  space: QaSpace;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  prefs: QaPrefs;
  onPref: <K extends keyof QaPrefs>(key: K, value: QaPrefs[K]) => void;
}) {
  const { t } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const headline = promptHeadline(prefs.qaPrompt, prefs.qaPromptCustom, t);
  const paths = handle ? qaPaths(handle, space) : null;
  const keys: QaPromptKey[] = [...QA_PROMPT_KEYS, "custom"];
  const shareTarget = useMemo(() => (shareOpen ? { kind: "prompt" as const, prompt: headline } : null), [shareOpen, headline]);

  const row = (label: string, help: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className={cn("flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm", disabled && "opacity-60")}>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );

  return (
    <details className="border-t border-border pt-4" id="studio-qa">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2">
        <StudioSectionIcon kind="questions" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium">{t("pages.qa.inbox.title")}</span>
          <span className="block truncate text-xs text-muted-foreground">{headline}</span>
        </span>
      </summary>
      <div className="space-y-3 py-3">
        {row(t("pages.qa.settings.accepting"), t("pages.qa.settings.acceptingHelp"), prefs.questionsEnabled, (v) => onPref("questionsEnabled", v))}
        {row(t("pages.qa.settings.onHub"), t("pages.qa.settings.onHubHelp"), prefs.qaOnHub, (v) => onPref("qaOnHub", v), !prefs.questionsEnabled)}
        {row(
          t("pages.qa.settings.page"),
          t("pages.qa.settings.pageHelp", { path: paths ? `rout.be${paths.ask}` : "/ask" }),
          prefs.qaPage,
          (v) => onPref("qaPage", v),
          !prefs.questionsEnabled,
        )}

        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("pages.qa.settings.prompt")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPref("qaPrompt", k)}
                aria-pressed={prefs.qaPrompt === k}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs transition-colors",
                  prefs.qaPrompt === k ? "border-story-ring bg-story-ring/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`pages.qa.prompt.${k}`)}
              </button>
            ))}
          </div>
          {prefs.qaPrompt === "custom" && (
            <input
              value={prefs.qaPromptCustom ?? ""}
              onChange={(e) => onPref("qaPromptCustom", e.target.value.slice(0, QA_PROMPT_CUSTOM_MAX) || null)}
              maxLength={QA_PROMPT_CUSTOM_MAX}
              placeholder={t("pages.qa.settings.customPlaceholder")}
              aria-label={t("pages.qa.settings.customPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <p className="text-[11px] text-muted-foreground">{t("pages.qa.settings.publishHint")}</p>
        </fieldset>

        {paths && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.settings.shareCard")}
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={prefs.qaPage ? paths.ask : paths.profile} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden />rout.be{prefs.qaPage ? paths.ask : paths.profile}</a>
            </Button>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{t("pages.qa.settings.safety")}
        </p>

        <QaInbox space={space} />

        <QaMutedList />
      </div>
      {handle && (
        <QaShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          target={shareTarget}
          handle={handle}
          space={space}
          displayName={displayName}
          avatarUrl={avatarUrl}
        />
      )}
    </details>
  );
}
