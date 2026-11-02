/** Recognises in-app WebViews (social apps, QR scanners) from the user agent. Pure and testable. */
const IN_APP = /(Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly|Bytedance|LinkedInApp|Twitter|Line\/|MicroMessenger|Pinterest|GSA\/|; wv\))/i;

export function isInAppBrowser(ua: string): boolean {
  return IN_APP.test(ua);
}

/** Android can hand the page to Chrome via an intent URL; iOS has no equivalent. */
export function systemBrowserUrl(href: string, ua: string): string | null {
  if (!/Android/i.test(ua)) return null;
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
}
