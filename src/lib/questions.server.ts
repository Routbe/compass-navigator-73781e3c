/**
 * Anonymous Q&A storage (db/94 + db/0175). Server-only.
 * New questions enter only through rout_qa_submit; the runtime role cannot read
 * sender columns, so nothing here can ever return who sent a question.
 */
import { sql } from "@/lib/neon";
import { ANSWER_MAX, QUESTION_MAX, normalizeText } from "./questions-rules";
import type { QaPublic } from "./qa/types";

type Row = Record<string, unknown>;
export type QaSpace = "root" | "alias";
export type Question = {
  id: string;
  space: QaSpace;
  body: string;
  prompt: string | null;
  answer: string | null;
  published: boolean;
  styleMasked: boolean;
  createdAt: string;
  answeredAt: string | null;
  storyUntil: string | null;
};
export type { QaPublic } from "./qa/types";

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function toQ(r: Row): Question {
  return {
    id: String(r["id"]),
    space: r["space"] === "alias" ? "alias" : "root",
    body: String(r["body"]),
    prompt: str(r["prompt"]),
    answer: str(r["answer"]),
    published: r["published"] === true,
    styleMasked: r["style_masked"] === true,
    createdAt: iso(r["created_at"]) ?? "",
    answeredAt: iso(r["answered_at"]),
    storyUntil: iso(r["story_until"]),
  };
}

function toPublic(raw: unknown): QaPublic | null {
  const o = typeof raw === "string" ? (JSON.parse(raw) as Row) : (raw as Row | null);
  if (!o || typeof o !== "object") return null;
  const answers = Array.isArray(o["answers"]) ? (o["answers"] as Row[]) : [];
  return {
    accepting: o["accepting"] !== false,
    onHub: o["onHub"] !== false,
    page: o["page"] === true,
    promptKey: str(o["promptKey"]),
    promptCustom: str(o["promptCustom"]),
    displayName: str(o["displayName"]),
    avatarUrl: str(o["avatarUrl"]),
    qaLevel: str(o["qaLevel"]),
    answers: answers.map((a) => ({
      id: String(a["id"]),
      body: String(a["body"] ?? ""),
      answer: String(a["answer"] ?? ""),
      prompt: str(a["prompt"]),
      answeredAt: iso(a["answeredAt"]) ?? "",
      storyUntil: iso(a["storyUntil"]),
    })),
  };
}

export async function publicQa(handle: string, space: QaSpace): Promise<QaPublic | null> {
  const rows = (await sql`select public.rout_qa_public(${handle}, ${space}) as qa`) as Row[];
  return toPublic(rows[0]?.["qa"]);
}

/** Always "ok" for a muted or shadow-banned sender: the database quarantines silently. */
export async function submitQuestion(input: {
  handle: string;
  space: QaSpace;
  body: string;
  senderKey: string | null;
  masked: boolean;
}): Promise<"ok" | "invalid" | "not_found"> {
  const body = normalizeText(input.body, QUESTION_MAX);
  if (!body) return "invalid";
  const rows = (await sql`select public.rout_qa_submit(${input.handle}, ${input.space}, ${body}, ${input.senderKey}, ${input.masked}) as r`) as Row[];
  const r = rows[0]?.["r"];
  return r === "invalid" || r === "not_found" ? r : "ok";
}

export async function myQuestions(ownerId: string, space: QaSpace | null): Promise<Question[]> {
  const rows = (space
    ? await sql`select id, space, body, prompt, answer, published, style_masked, created_at, answered_at, story_until
         from public.profile_questions
        where owner_id = ${ownerId} and space = ${space} and not is_quarantined
        order by created_at desc limit 200`
    : await sql`select id, space, body, prompt, answer, published, style_masked, created_at, answered_at, story_until
         from public.profile_questions
        where owner_id = ${ownerId} and not is_quarantined
        order by created_at desc limit 200`) as Row[];
  return rows.map(toQ);
}

/** Publishing (re)starts a 24-hour story around the avatar. */
export async function answerQuestion(ownerId: string, id: string, raw: string, publish: boolean): Promise<"ok" | "invalid"> {
  const answer = normalizeText(raw, ANSWER_MAX);
  if (!answer) return "invalid";
  await sql`update public.profile_questions
               set answer = ${answer}, published = ${publish}, answered_at = now(),
                   story_until = case when ${publish}::boolean then now() + interval '24 hours' else null end
             where id = ${id} and owner_id = ${ownerId}`;
  return "ok";
}

export async function unpublishQuestion(ownerId: string, id: string): Promise<void> {
  await sql`update public.profile_questions set published = false, story_until = null where id = ${id} and owner_id = ${ownerId}`;
}

export async function deleteQuestion(ownerId: string, id: string): Promise<void> {
  await sql`delete from public.profile_questions where id = ${id} and owner_id = ${ownerId}`;
}

/** Zero-knowledge mute: only the message id goes in; the database resolves the sender. */
export async function muteSenderByMessage(id: string): Promise<boolean> {
  const rows = (await sql`select public.rout_qa_mute_by_message(${id}::uuid) as ok`) as Row[];
  return rows[0]?.["ok"] === true;
}

export async function questionsEnabled(ownerId: string): Promise<boolean> {
  const rows = (await sql`select coalesce((display_prefs ->> 'questionsEnabled')::boolean, true) as on from public.profiles where id = ${ownerId}`) as Row[];
  return rows[0]?.["on"] !== false;
}

/** Owner toggle: off hides the block and the server refuses new questions. */
export async function setQuestionsEnabled(ownerId: string, on: boolean): Promise<void> {
  await sql`update public.profiles set display_prefs = coalesce(display_prefs, '{}'::jsonb) || jsonb_build_object('questionsEnabled', ${on}::boolean)
     where id = ${ownerId}`;
}

export type QaOwner = { handle: string; displayName: string | null; avatarUrl: string | null };

/** The signed-in member's own canvases (for share cards); RLS-scoped to their rows. */
export async function myQaOwners(userId: string): Promise<Partial<Record<QaSpace, QaOwner>>> {
  const [root, alias] = await Promise.all([
    sql`select username, display_name, avatar_url from public.profiles where id = ${userId} limit 1` as Promise<Row[]>,
    (sql`select handle, display_name, avatar_url from public.alias_profiles where user_id = ${userId} limit 1` as Promise<Row[]>).catch(() => [] as Row[]),
  ]);
  const out: Partial<Record<QaSpace, QaOwner>> = {};
  const r = root[0];
  if (r && str(r["username"])) out.root = { handle: String(r["username"]), displayName: str(r["display_name"]), avatarUrl: str(r["avatar_url"]) };
  const a = alias[0];
  if (a && str(a["handle"])) out.alias = { handle: String(a["handle"]), displayName: str(a["display_name"]), avatarUrl: str(a["avatar_url"]) };
  return out;
}

/** One entry per mute the member pressed: when, and the message they muted. Never a sender. */
export type QaMute = { id: string; mutedAt: string; excerpt: string | null; space: QaSpace | null };

export async function myMutes(): Promise<QaMute[]> {
  const rows = (await sql`select id, muted_at, excerpt, space from public.rout_qa_my_mutes()`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    mutedAt: iso(r["muted_at"]) ?? "",
    excerpt: str(r["excerpt"]),
    space: r["space"] === "alias" ? "alias" : r["space"] === "root" ? "root" : null,
  }));
}

/** Lifts one mute; the muted message returns to the inbox. */
export async function liftMute(id: string): Promise<boolean> {
  const rows = (await sql`select public.rout_qa_unmute(${id}::uuid) as ok`) as Row[];
  return rows[0]?.["ok"] === true;
}
