/**
 * The shared shape of an in-game guide page, for both games' knowledge bases:
 * Elden Ring's tutorial pages + loading-screen knowledge (er-guide.json) and
 * Nightreign's Guide archive (embedded in nightreign.json). Both are pure game text,
 * generated from TutorialParam / KnowledgeLoadScreenItemParam + their FMGs.
 */
export interface GuideEntry {
  id: number;
  title: string;
  body: string;
  /** Illustration id → <imageBase>/<image>.webp (the game's own tutorial art). */
  image?: number;
}

export interface GuideCategory {
  /** ER uses slugs ("tutorials", "status"), NR the game's own category ids (10/20/30). */
  id: string | number;
  label: string;
  entries: GuideEntry[];
}
