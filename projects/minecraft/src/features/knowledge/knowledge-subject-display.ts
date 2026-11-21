import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { MapPointImageSource } from "../map/map-point-icon.tsx";

export const humanizeKnowledgeId = (id: string) => {
  const value = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const words = value.replaceAll("/", " · ").replaceAll("_", " ");
  return words ? words[0].toLocaleUpperCase("en-US") + words.slice(1) : id;
};

export const fallbackKnowledgeSubjectDisplay: KnowledgeSubjectDisplay = (_kind, id) => ({
  name: humanizeKnowledgeId(id),
});

export interface ConfiguredKnowledgeAppearance {
  readonly kind: string;
  readonly id: string;
  readonly artwork: MapPointImageSource;
}

export const createConfiguredKnowledgeSubjectDisplay = (entries: readonly ConfiguredKnowledgeAppearance[],
  fallback: KnowledgeSubjectDisplay): KnowledgeSubjectDisplay => {
  const artwork = new Map(entries.map(entry => [`${entry.kind}:${entry.id}`, entry.artwork]));
  return (kind, id) => ({ ...fallback(kind, id), ...(artwork.get(`${kind}:${id}`) ? { image: artwork.get(`${kind}:${id}`)! } : {}) });
};
