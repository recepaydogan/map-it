import { GAME_KNOWLEDGE_MECHANICS, GAME_KNOWLEDGE_PROFILES, GAME_KNOWLEDGE_SUBJECTS } from "../../game-config.ts";
import { APP_LANGUAGES } from "../../i18n/language-order.ts";
import { parseMechanicsCatalogArtifact } from "./mechanics-catalog-artifact.ts";

export type BuiltInKnowledgeTranslate = (locale: string, key: string) => string;

const localizedCopy = (translate: BuiltInKnowledgeTranslate, nameKey: string, descriptionKey: string) =>
  Object.fromEntries(APP_LANGUAGES.map(({ code }) => [code, {
    name: translate(code, nameKey),
    description: translate(code, descriptionKey),
  }]));

const localizedNote = (translate: BuiltInKnowledgeTranslate, key: string) =>
  Object.fromEntries(APP_LANGUAGES.map(({ code }) => [code, translate(code, key)]));

/** Builds a validated catalog from game configuration without leaking game identities into the generic parser. */
export const resolveBuiltInMechanicsCatalog = (edition: string, version: string, locale: string,
  translate: BuiltInKnowledgeTranslate) => {
  const profile = GAME_KNOWLEDGE_PROFILES.find(candidate => candidate.edition === edition && candidate.version === version);
  if (!profile) return null;
  const provenanceByKey = profile.provenance as Readonly<Record<string, Readonly<{
    path: string; revision: string; sha256: string; url: string;
  }>>>;
  const artifact = {
    schemaVersion: 1,
    kind: "mechanics-catalog",
    source: { edition, version, revision: profile.revision, title: translate(locale, profile.titleKey), url: profile.url },
    subjects: GAME_KNOWLEDGE_SUBJECTS.map(subject => ({ kind: subject.kind, id: subject.id,
      text: localizedCopy(translate, subject.nameKey, subject.descriptionKey) })),
    mechanics: GAME_KNOWLEDGE_MECHANICS.filter(mechanic => mechanic.provenanceKey in provenanceByKey).map(mechanic => {
      const reference = (entry: typeof mechanic.requirements[number]) => ({ kind: entry.kind, id: entry.id,
        ...(entry.count ? { count: entry.count } : {}), ...(entry.noteKey ? { note: localizedNote(translate, entry.noteKey) } : {}) });
      const provenance = provenanceByKey[mechanic.provenanceKey];
      return { id: mechanic.id, kind: mechanic.kind, subject: mechanic.subject,
        text: localizedCopy(translate, mechanic.nameKey, mechanic.descriptionKey),
        requirements: mechanic.requirements.map(reference), inputs: mechanic.inputs.map(reference),
        outputs: mechanic.outputs.map(reference), related: mechanic.related.map(reference), provenance };
    }),
  };
  return parseMechanicsCatalogArtifact(artifact, { edition, version });
};
