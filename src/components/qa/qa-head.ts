import i18next from "i18next";
import type { QaSpace } from "./useQaPublic";

/** Head tags for the /ask pages (member page: no ROUT knowledge graph). */
export function qaAskHead(handle: string, space: QaSpace) {
  const tr = (key: string, fallback: string, params?: Record<string, string>) => {
    const out = i18next.isInitialized ? i18next.t(key, params ?? {}) : key;
    return out && out !== key ? out : fallback;
  };
  const title = tr("pages.qa.meta.title", `Stuur @${handle} een anoniem bericht`, { handle });
  const description = tr("pages.qa.meta.description", "Stuur een 100% anoniem bericht of vraag. Geen account nodig, de ontvanger ziet nooit wie je bent.");
  const path = `${space === "alias" ? "/u/" : "/"}${handle}/ask`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: `https://rout.be${path}` },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: `https://rout.be${path}` }],
  };
}
