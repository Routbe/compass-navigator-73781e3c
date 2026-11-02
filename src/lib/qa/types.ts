import type { QaAnswer } from "./story";

/** Public Q&A view of a profile (no owner id, ever). */
export type QaPublic = {
  accepting: boolean;
  onHub: boolean;
  page: boolean;
  promptKey: string | null;
  promptCustom: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  qaLevel: string | null;
  answers: QaAnswer[];
};
