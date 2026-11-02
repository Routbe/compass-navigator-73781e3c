import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "@/lib/auth/middleware";
import { ANSWER_MAX, QA_DEVICE_COOKIE, QUESTION_MAX, QUESTION_RATE, QUESTION_RATE_HOURLY } from "./questions-rules";

const handle = z.string().trim().regex(/^@?[A-Za-z0-9._-]{1,64}$/).transform((h) => h.replace(/^@/, ""));
const space = z.enum(["root", "alias"]).default("root");

/** Public: Q&A settings + answered questions of a public profile (never the owner id). */
export const getQaPublic = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle, space }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    try {
      return { qa: await s.publicQa(data.handle, data.space) };
    } catch (e) {
      console.error("[questions] public failed", e instanceof Error ? e.message : e);
      return { qa: null };
    }
  });

/** Public: who may send a question to this profile (minors default to verified accounts only). */
export const getQuestionAccess = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) => z.object({ handle, space }).parse(input))
  .handler(async ({ data, context }) => questionAccess(data.handle, data.space, context.userId));

async function questionAccess(h: string, sp: "root" | "alias", userId: string | null) {
  const { canSendQuestion, isQaLevel } = await import("./minor-safety");
  const s = await import("./questions.server");
  const qa = await s.publicQa(h, sp).catch(() => null);
  const raw = qa?.qaLevel;
  const level = !qa || !qa.accepting ? ("disabled" as const) : isQaLevel(raw) ? raw : ("public_unrestricted" as const);
  let verified = false;
  if (userId && level === "verified_only") {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select coalesce(verified, false) as v from public.profiles where id = ${userId} limit 1`) as Record<string, unknown>[];
    verified = rows[0]?.["v"] === true;
  }
  return { level, canSend: canSendQuestion(level, { signedIn: Boolean(userId), verified }) };
}

/** Per-device key (hashed cookie) so a recipient can mute an anonymous sender. */
async function senderDeviceKey(): Promise<string> {
  const { getCookie, setCookie } = await import("@tanstack/react-start/server");
  const { sha256Hex } = await import("@/lib/rate-limit-db.server");
  let sid = getCookie(QA_DEVICE_COOKIE);
  if (!sid || !/^[A-Za-z0-9_-]{32,64}$/.test(sid)) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    sid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    setCookie(QA_DEVICE_COOKIE, sid, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  }
  return sha256Hex(`qa-device:${sid}`);
}

/**
 * Public send. Muted or shadow-banned senders get the same "ok" as everybody:
 * the database quarantines their message silently. Ghost Mode happens before
 * sending (magic wand → /api/ai/rewrite), so the sender approves the exact
 * text that is stored; `ghost` only labels a message that came from the wand.
 */
export const askAnonymousQuestion = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) =>
    z.object({ handle, space, body: z.string().max(QUESTION_MAX * 2), ghost: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const access = await questionAccess(data.handle, data.space, context.userId);
    if (access.level === "disabled") return { result: "not_found" as const, masked: false };
    if (!access.canSend) return { result: "restricted" as const, masked: false };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp, hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const ip = clientIp(getRequest());
    const minute = await hitRateLimit("question-ask", ip, QUESTION_RATE);
    const hour = minute.ok ? await hitRateLimit("question-ask-hour", ip, QUESTION_RATE_HOURLY) : minute;
    if (!minute.ok || !hour.ok) return { result: "too_many" as const, masked: false };
    const { normalizeText } = await import("./questions-rules");
    const body = normalizeText(data.body, QUESTION_MAX);
    if (!body) return { result: "invalid" as const, masked: false };
    const s = await import("./questions.server");
    const senderKey = await senderDeviceKey().catch(() => null);
    const result = await s.submitQuestion({ handle: data.handle, space: data.space, body, senderKey, masked: data.ghost });
    return { result, masked: data.ghost };
  });

export const getMyQuestions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ space: z.enum(["root", "alias"]).nullable().default(null) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    try {
      const [questions, enabled] = await Promise.all([s.myQuestions(context.userId, data.space), s.questionsEnabled(context.userId)]);
      return { ready: true, enabled, questions };
    } catch (e) {
      console.error("[questions] inbox failed", e instanceof Error ? e.message : e);
      return { ready: false, enabled: true, questions: [] };
    }
  });

const idSchema = z.object({ id: z.string().uuid() });

export const answerMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.extend({ answer: z.string().max(ANSWER_MAX * 2), publish: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    return { result: await s.answerQuestion(context.userId, data.id, data.answer, data.publish) };
  });

/** Zero-knowledge mute: the payload is the message id only, never a user id. */
export const muteSenderOfQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.strict().parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    return { ok: await s.muteSenderByMessage(data.id) };
  });

export const unpublishMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.unpublishQuestion(context.userId, data.id);
    return { ok: true };
  });

export const deleteMyQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.deleteQuestion(context.userId, data.id);
    return { ok: true };
  });

export const setMyQuestionsEnabled = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./questions.server");
    await s.setQuestionsEnabled(context.userId, data.enabled);
    return { ok: true };
  });

/** Own handles + avatars per canvas, used to render share cards from the inbox. */
export const getMyQaOwners = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./questions.server");
    try {
      return { owners: await s.myQaOwners(context.userId) };
    } catch {
      return { owners: {} };
    }
  });

/** The member's own mutes (time + muted message only). */
export const getMyMutes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const s = await import("./questions.server");
    try {
      return { ready: true, mutes: await s.myMutes() };
    } catch (e) {
      console.error("[questions] mutes failed", e instanceof Error ? e.message : e);
      return { ready: false, mutes: [] as Awaited<ReturnType<typeof s.myMutes>> };
    }
  });

export const liftMyMute = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.strict().parse(input))
  .handler(async ({ data }) => {
    const s = await import("./questions.server");
    return { ok: await s.liftMute(data.id) };
  });
