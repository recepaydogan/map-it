import { parseEndpoint, splitArguments } from "./story-goal-facts.mjs";
import { stripLocalizationMarkup } from "./localization.mjs";

// A story name is a translated-string key, not a root-template name. Resolve
// it only for an explicitly reviewed actor/anchor scene, never globally.
export const readReviewedSceneDisplayName = (profile, reviews, readText) => {
  const change = profile.storyDisplayName;
  if (!change) return undefined;
  if (!change.reviews?.length || !/^[A-Za-z0-9_]+$/.test(change.key)) throw new Error(`Invalid scene name review: ${profile.id}`);
  for (const id of change.reviews) {
    const review = reviews.get(id);
    if (!profile.reviews.includes(id) || !review?.actions.some((action) => {
      if (!action.startsWith("SetStoryDisplayName(")) return false;
      const args = splitArguments(action);
      return args.length === 2 && parseEndpoint(args[0])?.id === profile.characterContentId && args[1] === JSON.stringify(change.key);
    })) throw new Error(`Unproven scene name assignment: ${profile.id}/${id}`);
  }
  const names = JSON.parse(readText(change.sourcePath)).save?.regions?.TranslatedStringKeys?.TranslatedStringKey;
  const matches = names?.filter((row) => row.UUID?.value === change.key) ?? [];
  if (matches.length !== 1) throw new Error(`Missing/ambiguous native name key: ${change.key}`);
  const handle = matches[0].Content?.handle;
  if (!/^h[a-z0-9]+$/.test(handle)) throw new Error(`Invalid native name handle: ${change.key}`);
  const localizedTitles = {};
  for (const [language, file] of Object.entries(change.localization ?? {})) {
    const entries = [...readText(file).matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)]
      .filter((entry) => entry[1] === handle);
    if (entries.length !== 1) throw new Error(`Missing/ambiguous localized scene name: ${change.key}/${language}`);
    const title = stripLocalizationMarkup(entries[0][2]);
    if (!title) throw new Error(`Empty localized scene name: ${change.key}/${language}`);
    localizedTitles[language] = title;
  }
  if (!localizedTitles.en) throw new Error(`No English native scene name: ${change.key}`);
  return localizedTitles;
};
