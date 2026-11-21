import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { hasMapDefinition } from "../map/map-registry";
import type { ReferenceEntry } from "./reference-types";

const ReferenceMapLinkGroup = ({ group, onOpenMap }: {
  group: NonNullable<ReferenceEntry["mapLinks"]>[number];
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ordered = group.links.filter((link) => hasMapDefinition(link.mapId)).sort((left, right) =>
    t(left.nameKey).localeCompare(t(right.nameKey)));
  if (!ordered.length) return null;
  const visible = expanded ? ordered : ordered.slice(0, 6);
  return <section className="space-y-3">
      <DatabaseSectionTitle>{t(group.titleKey)}</DatabaseSectionTitle>
      <div className="grid gap-1.5">{visible.map((link) => <button
        key={`${link.mapId}:${link.markerId}`} type="button"
        onClick={() => onOpenMap(link.mapId, link.markerId)}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2 text-left text-[12px] transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0 flex-1 font-medium text-zinc-100">{t(link.nameKey)}</span>
        <ChevronRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" />
      </button>)}</div>
      {!expanded && ordered.length > 6 && <button type="button"
        onClick={() => setExpanded(true)}
        className="w-full cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-center text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        {t("reference.showMore", { count: ordered.length - 6 })}
      </button>}
    </section>;
};

const ReferenceMapLinks = ({ groups, onOpenMap }: {
  groups: NonNullable<ReferenceEntry["mapLinks"]>;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => <div className="space-y-6">{groups.filter((group) => group.links.length > 0)
  .map((group) => <ReferenceMapLinkGroup key={group.titleKey}
    group={group} onOpenMap={onOpenMap} />)}</div>;

export default ReferenceMapLinks;
