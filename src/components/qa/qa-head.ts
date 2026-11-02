import i18next from "i18next";
import type { QaSpace } from "./useQaPublic";

/** Head tags for the /ask pages (member page: no ROUT knowledge graph). */
export function qaAskHead(handle: string, space: QaSpace) {
  const title = i18next.t("pages.qa.meta.title", { handle });
  const description = i18next.t("pages.qa.meta.description");
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
