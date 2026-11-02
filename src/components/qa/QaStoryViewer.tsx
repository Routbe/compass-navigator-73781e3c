import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircleQuestion, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { storedPromptLabel } from "@/lib/qa/prompts";
import type { QaAnswer } from "@/lib/qa/story";
import { qaPaths, type QaSpace } from "./useQaPublic";

const STORY_MS = 6500;

function relativeTime(iso: string, locale: string): string {
  // Clamp small clock skew so a fresh answer never reads "in a minute".
  const diff = Math.min(0, (Date.parse(iso) - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), "minute");
  return rtf.format(Math.round(diff / 3600), "hour");
}

/** Full-screen status viewer: tap right/left to move, hold to pause, Esc or ✕ to close. */
export function QaStoryViewer({ stories, handle, space, displayName, avatarUrl, onClose }: {
  stories: QaAnswer[];
  handle: string;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const story = stories[index];
  const avatar = profileImageSrc(avatarUrl);
  const name = displayName || `@${handle}`;

  const next = useCallback(() => {
    if (index + 1 >= stories.length) onClose();
    else setIndex(index + 1);
  }, [index, stories.length, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose, next, prev]);

  if (!story) return null;
  const promptLabel = storedPromptLabel(story.prompt, t);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("pages.qa.story.open", { name })}
      className="fixed inset-0 z-[110] flex select-none flex-col bg-gradient-to-b from-story-from to-story-to text-story-card"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3">
        <div className="flex gap-1" aria-hidden>
          {stories.map((s, i) => (
            <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-story-card/30">
              {i < index && <span className="block h-full w-full bg-story-card" />}
              {i === index && (
                <span
                  key={`${s.id}-${index}`}
                  className="qa-story-progress block h-full w-full bg-story-card"
                  data-paused={paused ? "true" : "false"}
                  style={{ ["--qa-story-ms" as string]: `${STORY_MS}ms` }}
                  onAnimationEnd={next}
                />
              )}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-story-ring" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-story-card text-sm font-semibold text-story-ink">{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs opacity-70">{relativeTime(story.answeredAt, locale)}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-story-card/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-story-card"
            aria-label={t("pages.qa.story.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <button type="button" className="absolute inset-y-0 left-0 w-1/3" onClick={prev} aria-label={t("pages.qa.story.prev")} />
          <button type="button" className="absolute inset-y-0 right-0 w-2/3" onClick={next} aria-label={t("pages.qa.story.next")} />
          <article key={story.id} className="pointer-events-none w-full animate-in fade-in zoom-in-95 duration-300">
            <div className="overflow-hidden rounded-[28px] bg-story-card text-story-ink shadow-2xl">
              <div className="bg-gradient-to-br from-story-ring to-story-ring-2 px-6 pb-6 pt-5 text-story-card">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest opacity-85">
                  <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden /> {promptLabel ?? t("pages.qa.story.anonymous")}
                </p>
                <p className="mt-2 break-words font-display text-2xl leading-snug">{story.body}</p>
              </div>
              <p className="whitespace-pre-line break-words px-6 py-5 text-lg leading-relaxed">{story.answer}</p>
            </div>
          </article>
        </div>

        <a
          href={qaPaths(handle, space).ask}
          onPointerDown={(e) => e.stopPropagation()}
          className="relative z-10 mb-4 inline-flex min-h-12 items-center justify-center rounded-full bg-story-card px-5 text-sm font-semibold text-story-ink transition-transform active:scale-[0.98]"
        >
          {t("pages.qa.story.askToo")}
        </a>
      </div>
    </div>,
    document.body,
  );
}
