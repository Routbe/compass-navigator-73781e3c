import { describe, expect, it, afterEach } from "vitest";
import { buildBrevoPayload, mailProvider } from "./brevo-driver";

const base = { from: { name: "ROUT", email: "auth@rout.be" }, to: "a@b.be", replyTo: { email: "hallo@rout.be" }, subject: "S", html: '<a href="https://rout.be/x">x</a>', text: "x", messageId: "<abc@rout.be>", entityRefId: "mail_1" };

describe("brevo driver", () => {
  afterEach(() => { delete process.env["MAIL_PROVIDER"]; });
  it("defaults to brevo and switches to infomaniak", () => {
    expect(mailProvider()).toBe("brevo");
    process.env["MAIL_PROVIDER"] = "infomaniak";
    expect(mailProvider()).toBe("infomaniak");
  });
  it("strips list headers and sets threading ids", () => {
    const p = buildBrevoPayload({ ...base, extraHeaders: { "List-Unsubscribe": "<x>", Precedence: "bulk", "X-Campaign": "1" } });
    const h = p["headers"] as Record<string, string>;
    expect(Object.keys(h).filter((k) => /^(list-|precedence|x-campaign)/i.test(k))).toEqual([]);
    expect(h["X-Entity-Ref-ID"]).toBe("mail_1");
    expect(h["X-Mailin-Track-Opens"]).toBe("0");
    expect(h["X-Mailin-Track-Clicks"]).toBe("0");
    expect(h["Message-ID"]).toBe("<abc@rout.be>");
  });
  it("keeps raw links in html", () => {
    expect(buildBrevoPayload(base)["htmlContent"]).toContain('href="https://rout.be/x"');
  });
});
