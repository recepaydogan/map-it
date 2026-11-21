import AdventureLinkList from "./adventure-link-list";
import type { ReferenceLink } from "./reference-types";

const DungeonCreatureList = ({ links, dungeonId, bosses = false, onShowMap, mapLinkIds }: {
  links: ReferenceLink[]; dungeonId?: string; bosses?: boolean;
  onShowMap?: (link: ReferenceLink) => void; mapLinkIds?: Set<string>;
}) => {
  const unique = [...new Map(links.map((link) => [link.id, link])).values()];
  // Same-name records share a list row; distinct definitions remain selectable.
  const groups = new Map<string, ReferenceLink[]>();
  for (const link of unique) {
    groups.set(link.name, [...(groups.get(link.name) ?? []), link]);
  }
  const variants = new Map<string, ReferenceLink[]>();
  const visible: ReferenceLink[] = [];
  for (const [name, group] of groups) {
    if (bosses && group.some((link) => link.challengeLevel !== undefined)) {
      const levels = [...group].sort((a, b) => (a.challengeLevel ?? 0) - (b.challengeLevel ?? 0));
      variants.set(name, levels);
      visible.push(levels[0]);
      continue;
    }
    visible.push({ ...group[0], ...(group.length > 1 ? { quantity: group.length } : {}) });
    if (new Set(group.map((link) => link.contentGroup ?? link.id)).size > 1) variants.set(name, group);
  }
  return <AdventureLinkList links={visible} tone={bosses ? "boss" : "creature"} dungeonId={dungeonId}
    variants={variants} onShowMap={onShowMap} mapLinkIds={mapLinkIds} />;
};
export default DungeonCreatureList;
