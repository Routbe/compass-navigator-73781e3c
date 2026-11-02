# Translation audit, footer fixes and sign-in page cleanup

## What I already found
- The translation files are complete per language (no missing keys), so the problem is **text written straight into pages** that never goes through translation. Example from your screenshot: on the French sign-in page "Face ID, Touch ID of beveiligingssleutel — zonder wachtwoord" is still Dutch.
- Hundreds of hidden texts are hard-coded: tooltips, screen-reader labels, input placeholders and popup messages (e.g. admin, account settings, booking studio, QR style tabs, dashboard block settings).
- Footer: every link name and column title is fixed English ("Platform", "Contact form", "© … Designed & engineered by"), "QR generator" points to the homepage instead of the QR generator page, and the language picker sits inside the logo link (tapping it can jump to home).
- Sign-in page: the passkey button text runs outside the button in longer languages, and a Proton button is shown.

## 1. Deep translation audit (all 4 languages: NL, EN, FR, DE)
- Automated scan of every page and component for visible text not going through translation: button labels, headings, tooltips (`title`), screen-reader labels, placeholders, alt texts, popup/toast messages, dialogs, empty/error states, confirm prompts and page titles.
- Browser pass: open each public page and the signed-in pages in all 4 languages, hover/open menus, dialogs and popups, and flag text in the wrong language.
- Write a short report of everything found, then fix it all by moving texts into the translation files with proper NL/EN/FR/DE wording.
- Add an automated check that fails when new hard-coded visible text or a missing translation appears, so it cannot regress.

## 2. Footer
- "QR generator" links to the real QR generator page; check every other footer link opens the right page (no dead or wrong links).
- Translate all column titles, link names and the bottom line.
- Move the language picker out of the logo link and tidy the layout: cleaner columns on phone (2 columns, even spacing), aligned headings, bottom line centered.
- Sign-in page footer (Privacy · Terms · Data deletion): wrap neatly on small screens with better spacing.

## 3. Sign-in page
- Remove the "Sign in with Proton" button (and its server-side provider entry) since Proton doesn't offer it.
- Passkey button: text wraps/shrinks inside the button in every language, icon stays inside.
- Translate the passkey hint and any remaining sign-in texts.
- Re-balance the provider grid after Proton is removed (7 buttons laid out evenly).

## Verification
- Screenshots of sign-in page and footer on phone and desktop in all 4 languages.
- Click-test every footer link.
- Run the new translation check, existing tests and `bunx tsgo --noEmit`.

## Technical notes
- Translations via existing `useI18n().t` and `src/locales/**` files; new keys added for all four locales.
- Proton removal touches `ProviderKit.tsx`, `AuthNeon.tsx`, `ProtonMark.tsx`, `better-auth.server.ts`, and `api_.public.auth.providers.ts`.
- This is a large sweep (300+ routes); admin-only screens included.
