import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EyeOff, MessageCircleReply, MoreHorizontal, Send, Share2, Sparkles, Trash2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  answerMyQuestion,
  deleteMyQuestion,
  getMyQaOwners,
  getMyQuestions,
  muteSenderOfQuestion,
  unpublishMyQuestion,
} from "@/lib/questions.functions";
import { ANSWER_MAX } from "@/lib/questions-rules";
import { storedPromptLabel } from "@/lib/qa/prompts";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QaShareDialog, type QaShareTarget } from "./QaShareDialog";
import type { QaSpace } from "./useQaPublic";

/**
 * The Void Inbox: dark bento cards with three actions per message — answer
 * publicly, share as a story, or shadow-mute the unknown sender. The mute call
 * carries only the message id; who sent it is never known to this screen.
 */
export function QaInbox({ space, limit, compact = false }: {
  /** null = every canvas (Command Center), otherwise one Studio canvas. */
  space: QaSpace | null;
  limit?: number;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyQuestions);
  const answer = useServerFn(answerMyQuestion);
  const unpublish = useServerFn(unpublishMyQuestion);
  const del = useServerFn(deleteMyQuestion);
  const mute = useServerFn(muteSenderOfQuestion);
  const fetchOwners = useServerFn(getMyQaOwners);
  const q = useQuery({ queryKey: ["my-questions", space ?? "all"], queryFn: () => fetchMine({ data: { space } }), retry: false });
  const ownersQ = useQuery({ queryKey: ["my-qa-owners"], queryFn: () => fetchOwners(), staleTime: 300_000, retry: false });
  const owners = ownersQ.data?.owners ?? {};
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [muteId, setMuteId] = useState<string | null>(null);
  const [share, setShare] = useState<{ target: QaShareTarget; space: QaSpace } | null>(null);
  const all = q.data?.questions ?? [];
  const items = limit ? all.slice(0, limit) : all;
  const open = all.filter((i) => !i.answer).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-questions"] });

  const publish = async (id: string) => {
    const text = drafts[id] ?? all.find((i) => i.id === id)?.answer ?? "";
    try {
      const { result } = await answer({ data: { id, answer: text, publish: true } });
      if (result === "ok") {
        toast.success(t("pages.qa.inbox.published"));
        setReplying(null);
        void refresh();
      } else toast.error(t("pages.qa.inbox.required"));
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };

  const confirmMute = async () => {
    const id = muteId;
    setMuteId(null);
    if (!id) return;
    try {
      const { ok } = await mute({ data: { id } });
      if (!ok) throw new Error("mute_failed");
      toast.success(t("pages.qa.inbox.muted"), { duration: 7000 });
      void refresh();
      void qc.invalidateQueries({ queryKey: ["my-qa-mutes"] });
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };

  const remove = async (id: string) => {
    try { await del({ data: { id } }); void refresh(); } catch { toast.error(t("pages.qa.inbox.failed")); }
  };

  if (q.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-hidden />;
  if (q.isError && !q.data) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <span>{t("pages.qa.loadFailed")}</span>
        <button type="button" onClick={() => void q.refetch()} className="min-h-9 rounded-full border border-border px-3 font-medium text-foreground">{t("pages.qa.retry")}</button>
      </div>
    );
  }

  const shareOwner = share ? owners[share.space] : undefined;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("pages.qa.inbox.counts", { total: all.length, open })}</p>
      {items.length === 0 && <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("pages.qa.inbox.empty")}</p>}
      <ul className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        {items.map((it) => {
          const owner = owners[it.space];
          const prompt = storedPromptLabel(it.prompt, t);
          const isReplying = replying === it.id;
          return (
            <li key={it.id} className="dark flex flex-col rounded-2xl border border-border bg-background p-4 text-foreground shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {prompt && <span className="truncate">{prompt}</span>}
                    {space === null && <span className="rounded-full border border-border px-1.5">{t(`pages.qa.inbox.space.${it.space}`)}</span>}
                    {it.styleMasked && <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5"><Sparkles className="h-3 w-3" aria-hidden />{t("pages.qa.inbox.masked")}</span>}
                    {it.published && <span className="rounded-full bg-story-ring/20 px-1.5 text-story-ring">{t("pages.qa.inbox.live")}</span>}
                  </p>
                  <p className="mt-1.5 break-words text-[15px] font-medium leading-snug">{it.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(it.createdAt).toLocaleString(locale)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("pages.qa.inbox.actions")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setReplying(it.id)}><MessageCircleReply className="mr-2 h-4 w-4" />{t("pages.qa.inbox.answer")}</DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!owner}
                      onSelect={() => setShare({ space: it.space, target: { kind: "answer", question: it.body, answer: it.answer ?? "" } })}
                    >
                      <Share2 className="mr-2 h-4 w-4" />{t("pages.qa.inbox.share")}
                    </DropdownMenuItem>
                    {it.published && (
                      <DropdownMenuItem onSelect={async () => { try { await unpublish({ data: { id: it.id } }); } catch { toast.error(t("pages.qa.inbox.failed")); } void refresh(); }}>
                        <EyeOff className="mr-2 h-4 w-4" />{t("pages.qa.inbox.hide")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setMuteId(it.id)} className="text-destructive focus:text-destructive">
                      <VolumeX className="mr-2 h-4 w-4" />{t("pages.qa.inbox.mute")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void remove(it.id)}><Trash2 className="mr-2 h-4 w-4" />{t("pages.qa.inbox.delete")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {it.answer && !isReplying && (
                <p className="mt-3 whitespace-pre-line break-words rounded-xl bg-muted px-3 py-2 text-sm">{it.answer}</p>
              )}
              {isReplying ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    autoFocus
                    value={drafts[it.id] ?? it.answer ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value.slice(0, ANSWER_MAX) }))}
                    rows={3}
                    placeholder={t("pages.qa.inbox.answerPlaceholder")}
                    aria-label={t("pages.qa.inbox.answer")}
                    className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void publish(it.id)} className="gap-1.5"><Send className="h-3.5 w-3.5" />{it.published ? t("pages.qa.inbox.update") : t("pages.qa.inbox.publish")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{t("pages.qa.inbox.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant={it.answer ? "outline" : "default"} className="gap-1.5" onClick={() => setReplying(it.id)}>
                    <MessageCircleReply className="h-3.5 w-3.5" />{it.answer ? t("pages.qa.inbox.update") : t("pages.qa.inbox.answer")}
                  </Button>
                  {it.answer && owner && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShare({ space: it.space, target: { kind: "answer", question: it.body, answer: it.answer ?? "" } })}>
                      <Share2 className="h-3.5 w-3.5" />{t("pages.qa.inbox.share")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={muteId !== null} onOpenChange={(v) => !v && setMuteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.qa.inbox.muteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pages.qa.inbox.muteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pages.qa.inbox.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmMute()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("pages.qa.inbox.muteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {shareOwner && (
        <QaShareDialog
          open={share !== null}
          onOpenChange={(v) => !v && setShare(null)}
          target={share?.target ?? null}
          handle={shareOwner.handle}
          space={share!.space}
          displayName={shareOwner.displayName}
          avatarUrl={shareOwner.avatarUrl}
        />
      )}
    </div>
  );
}
