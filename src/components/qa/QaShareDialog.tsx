import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Loader2, Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qaPaths, type QaSpace } from "./useQaPublic";

export type QaShareTarget =
  | { kind: "prompt"; prompt: string }
  | { kind: "answer"; question: string; answer: string };

/**
 * Story generator: renders a 1080×1920 card in the browser and hands it to the
 * phone's share sheet (Instagram, Snapchat, WhatsApp…) or downloads it.
 */
export function QaShareDialog({ open, onOpenChange, target, handle, space, displayName, avatarUrl }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: QaShareTarget | null;
  handle: string;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const { t } = useI18n();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const link = typeof window === "undefined" ? qaPaths(handle, space).ask : `${window.location.origin}${qaPaths(handle, space).ask}`;
  const fileName = `rout-${handle}-${target?.kind ?? "story"}.png`;

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    let objectUrl: string | null = null;
    setBlob(null); setUrl(null); setFailed(false);
    void import("@/lib/qa/story-card").then(async ({ renderStoryCard }) => {
      const common = { handle, displayName, avatarSrc: profileImageSrc(avatarUrl), hint: t("pages.qa.share.hint"), link };
      const b = await renderStoryCard(
        target.kind === "prompt"
          ? { kind: "prompt", prompt: target.prompt, sendMe: t("pages.qa.card.sendMe"), ...common }
          : { kind: "answer", question: target.question, answer: target.answer, label: t("pages.qa.card.anonymous"), ...common },
      );
      if (!alive) return;
      objectUrl = URL.createObjectURL(b);
      setBlob(b); setUrl(objectUrl);
    }).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, target, handle, displayName, avatarUrl, link, t]);

  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShareFile = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: `${t("pages.qa.share.hint")} ${link}` });
    } catch {
      /* the visitor closed the share sheet */
    }
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("pages.qa.share.copied"));
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };
  const caption = encodeURIComponent(`${target?.kind === "prompt" ? target.prompt : t("pages.qa.share.hint")} ${link}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages.qa.share.title")}</DialogTitle>
          <DialogDescription>{target?.kind === "answer" ? t("pages.qa.share.answerCard") : t("pages.qa.share.promptCard")}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto aspect-[9/16] w-full max-w-[min(18rem,calc((100dvh-22rem)*9/16))] min-w-[10rem] overflow-hidden rounded-2xl border border-border bg-muted">
          {url ? (
            <img src={url} alt={t("pages.qa.share.title")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              {failed ? t("pages.qa.share.failed") : <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("pages.qa.share.rendering")}</>}
            </div>
          )}
        </div>
        <div className="grid gap-2">
          {canShareFile && (
            <Button onClick={() => void share()} className="gap-2"><Share2 className="h-4 w-4" aria-hidden />{t("pages.qa.share.share")}</Button>
          )}
          <Button variant={canShareFile ? "outline" : "default"} onClick={download} disabled={!url} className="gap-2">
            <Download className="h-4 w-4" aria-hidden />{t("pages.qa.share.download")}
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/?text=${caption}`} target="_blank" rel="noopener noreferrer">{t("pages.qa.share.whatsapp")}</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">{t("pages.qa.share.snapchat")}</a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copy()} className="gap-1"><Copy className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.share.copy")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("pages.qa.share.howto")} <span className="break-all font-mono text-foreground">{link.replace(/^https?:\/\//, "")}</span></p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
