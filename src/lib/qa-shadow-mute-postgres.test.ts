// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listMigrationFiles, planMigrations } from "../../scripts/migration-plan";
import { contextStatements } from "./db-context";

const R = "aaaaaaaa-1111-4111-8111-111111111111"; // recipient
const A = "bbbbbbbb-2222-4222-8222-222222222222"; // signed-in sender
const R2 = "cccccccc-3333-4333-8333-333333333333";
const R3 = "dddddddd-4444-4444-8444-444444444444";
const KEY = "a".repeat(64);
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

beforeAll(async () => {
  for (const step of planMigrations(listMigrationFiles("db"), new Set())) {
    if (step.action === "run") await db.exec(`begin;${readFileSync(`db/${step.file}`, "utf8")};commit;`);
  }
}, 240_000);
afterAll(async () => { await db.close(); });

async function seed() {
  await db.exec("begin");
  await db.query("insert into public.users(id,email) values($1,'r@example.test'),($2,'a@example.test'),($3,'r2@example.test'),($4,'r3@example.test')", [R, A, R2, R3]);
  await db.query("update public.profiles set username = case id when $1::uuid then 'recipient' when $2::uuid then 'sender' when $3::uuid then 'second' else 'third' end where id in ($1,$2,$3,$4)", [R, A, R2, R3]);
}
async function as(id: string | null) {
  await db.exec("reset role");
  await db.exec("set local role rout_app");
  for (const s of contextStatements({ userId: id, workspaceId: null })) await db.query(s.query, s.params);
}
const submit = (handle: string, body: string, key: string | null = null) =>
  db.query<{ r: string }>("select public.rout_qa_submit($1,'root',$2,$3,false) as r", [handle, body, key]).then((x) => x.rows[0]?.r);
const inbox = () =>
  db.query<{ id: string; body: string }>("select id, body from public.profile_questions where not is_quarantined order by created_at");
const mute = (id: string) => db.query<{ ok: boolean }>("select public.rout_qa_mute_by_message($1) as ok", [id]).then((x) => x.rows[0]?.ok);
const trust = async (id: string) => {
  await db.exec("reset role");
  return (await db.query<{ trust_score: number; global_shadow_ban_starts_at: Date | null; global_shadow_ban_until: Date | null }>(
    "select trust_score, global_shadow_ban_starts_at, global_shadow_ban_until from public.users where id=$1", [id])).rows[0];
};

it("a muted sender still gets ok, but the message never reaches the inbox", async () => {
  try {
    await seed();
    await as(A);
    expect(await submit("recipient", "eerste bericht", KEY)).toBe("ok");
    await as(R);
    const [first] = (await inbox()).rows;
    expect(first?.body).toBe("eerste bericht");
    expect(await mute(first!.id)).toBe(true);
    expect((await inbox()).rows).toEqual([]);

    await as(A);
    expect(await submit("recipient", "tweede bericht", KEY)).toBe("ok");
    await as(R);
    expect((await inbox()).rows).toEqual([]);
    await db.exec("reset role");
    const stored = await db.query<{ is_quarantined: boolean; quarantine_reason: string }>("select is_quarantined, quarantine_reason from public.profile_questions where body='tweede bericht'");
    expect(stored.rows[0]).toEqual({ is_quarantined: true, quarantine_reason: "local_mute" });
  } finally { await db.exec("rollback"); }
}, 30_000);

it("the recipient's runtime role can never read who sent a question", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "wie ben ik?", KEY);
    await as(R);
    await db.exec("savepoint s");
    await expect(db.query("select sender_user_id from public.profile_questions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select sender_key from public.profile_questions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select muted_sender_id from public.shadow_mutes")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("insert into public.profile_questions(owner_id, body) values ($1, 'x')", [R])).rejects.toThrow(/permission denied/);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("each mute costs the sender 20 trust points", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hallo", null);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    expect((await trust(A))?.trust_score).toBe(80);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("below 50 trust points a 7-day global ban starts after a 12-48 hour delay", async () => {
  try {
    await seed();
    for (const handle of ["recipient", "second", "third"]) {
      await as(A);
      await submit(handle, `bericht aan ${handle}`, null);
    }
    for (const owner of [R, R2, R3]) {
      await as(owner);
      await mute((await inbox()).rows[0]!.id);
    }
    const t = await trust(A);
    expect(t?.trust_score).toBe(40);
    const delayH = (new Date(t!.global_shadow_ban_starts_at!).getTime() - Date.now()) / 3_600_000;
    expect(delayH).toBeGreaterThanOrEqual(11.9);
    expect(delayH).toBeLessThanOrEqual(48.1);
    const lengthD = (new Date(t!.global_shadow_ban_until!).getTime() - new Date(t!.global_shadow_ban_starts_at!).getTime()) / 86_400_000;
    expect(lengthD).toBeCloseTo(7, 5);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("an active global ban quarantines messages to everyone while still answering ok", async () => {
  try {
    await seed();
    await db.query("update public.users set trust_score=40, global_shadow_ban_starts_at=now()-interval '1 hour', global_shadow_ban_until=now()+interval '6 days' where id=$1", [A]);
    await as(A);
    expect(await submit("second", "nieuw bericht", null)).toBe("ok");
    await as(R2);
    expect((await inbox()).rows).toEqual([]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("only the recipient can mute through a message id", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hoi", KEY);
    await db.exec("reset role");
    const id = (await db.query<{ id: string }>("select id from public.profile_questions")).rows[0]!.id;
    await as(R2);
    expect(await mute(id)).toBe(false);
    expect((await trust(A))?.trust_score).toBe(100);
  } finally { await db.exec("rollback"); }
}, 30_000);

const myMutes = () =>
  db.query<{ id: string; excerpt: string | null }>("select id, excerpt from public.rout_qa_my_mutes()").then((x) => x.rows);
const unmute = (id: string) => db.query<{ ok: boolean }>("select public.rout_qa_unmute($1) as ok", [id]).then((x) => x.rows[0]?.ok);

it("lifting a mute lets new messages through again and returns the muted message", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "eerste", KEY);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    const list = await myMutes();
    expect(list).toHaveLength(1);
    expect(list[0]?.excerpt).toBe("eerste");
    expect(await unmute(list[0]!.id)).toBe(true);
    expect(await myMutes()).toEqual([]);
    expect((await inbox()).rows.map((r) => r.body)).toEqual(["eerste"]);
    await as(A);
    await submit("recipient", "na opheffen", KEY);
    await as(R);
    expect((await inbox()).rows.map((r) => r.body).sort()).toEqual(["eerste", "na opheffen"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("muting, lifting and muting the same sender again costs trust only once", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "een", null);
    await as(R);
    const first = (await inbox()).rows[0]!.id;
    await mute(first);
    await unmute((await myMutes())[0]!.id);
    await mute(first);
    expect((await trust(A))?.trust_score).toBe(80);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("two mutes that hit the same sender stay two entries, and lifting one keeps the sender muted", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "een", KEY);
    await submit("recipient", "twee", KEY);
    await as(R);
    const [one, two] = (await inbox()).rows;
    await mute(one!.id);
    await mute(two!.id);
    const list = await myMutes();
    expect(list).toHaveLength(2);
    await unmute(list.find((m) => m.excerpt === "een")!.id);
    await as(A);
    await submit("recipient", "drie", KEY);
    await as(R);
    expect((await inbox()).rows.map((r) => r.body)).toEqual(["een"]);
  } finally { await db.exec("rollback"); }
}, 30_000);

it("only the recipient can list or lift their mutes, and never through the tables", async () => {
  try {
    await seed();
    await as(A);
    await submit("recipient", "hoi", KEY);
    await as(R);
    await mute((await inbox()).rows[0]!.id);
    const id = (await myMutes())[0]!.id;
    await as(R2);
    expect(await myMutes()).toEqual([]);
    expect(await unmute(id)).toBe(false);
    await db.exec("savepoint s");
    await expect(db.query("select id from public.qa_mute_actions")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("delete from public.shadow_mutes")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await expect(db.query("select recipient_id from public.qa_trust_charges")).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint s");
    await as(R);
    expect(await myMutes()).toHaveLength(1);
  } finally { await db.exec("rollback"); }
}, 30_000);
