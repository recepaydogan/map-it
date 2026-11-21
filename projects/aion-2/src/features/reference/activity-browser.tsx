import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { ACTIVITY_CHALLENGE_ARTWORK_ID } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import { loadEntityArtwork } from "../../lib/entity-artwork";
import ActivityDetail from "./activity-detail";
import { groupActivities, matchesActivity } from "./activity-families";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";

const ActivityBrowser = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceIndex();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState(target.id);
  const [artworkIcons, setArtworkIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    loadEntityArtwork().then(({ icons }) => {
      if (!cancelled) setArtworkIcons(icons);
    }).catch((error: unknown) => console.error("Failed to load activity artwork", error));
    return () => { cancelled = true; };
  }, []);
  const eventTarget = state.status === "ready" ? state.data.entries.find((entry) => entry.id === target.id && entry.activity?.kind === "event") : undefined;
  const families = useMemo(() => {
    if (state.status !== "ready") return [];
    const entries = state.data.entries.filter((entry) => entry.category === "activities");
    const selectedEvent = entries.find((entry) => entry.id === target.id && entry.activity?.kind === "event");
    return groupActivities(entries.filter((entry) => selectedEvent
      ? entry.activity?.kind === "event" && (selectedEvent.activity?.familyId
        ? entry.activity.familyId === selectedEvent.activity.familyId : entry.id === selectedEvent.id)
      : entry.activity?.kind === "challenge"), target.id);
  }, [state, target.id]);
  const tiers = [...new Set(families.flatMap((family) => family.variants.flatMap((entry) => entry.activity?.tier ? [entry.activity.tier] : [])))].sort((a, b) => a - b);
  const filtered = families.filter((family) => (!tier || family.variants.some((entry) => String(entry.activity?.tier) === tier))
    && (matchesActivity(family, query) || gameText(family.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      || family.variants.some((entry) => gameText(entry.activity?.region ?? "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
  const family = families.find((family) => family.variants.some((entry) => entry.id === selected));
  const current = family?.variants.find((entry) => entry.id === selected);
  useEffect(() => {
    if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name });
  }, [current, onCurrentChange]);
  if (state.status !== "ready") return <p className="p-6 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <ItemCatalog
    label={t(eventTarget ? "reference.categories.activities" : "reference.activity.challenges")}
    search={{ query, label: t("reference.activity.search"), clearLabel: t("database.clearSearch"), onChange: (value) => { setQuery(value); setSelected(""); } }}
    categoryLabel={t("reference.activity.layer")}
    categories={!eventTarget && tiers.length > 0 && <>
      <ItemCatalogCategory label={t("reference.activity.allLayers")} active={!tier} onSelect={() => { setTier(""); setSelected(""); }} />
      {tiers.map((value) => <ItemCatalogCategory key={value} label={t("reference.activity.layerNumber", { number: value })} active={tier === String(value)}
        onSelect={() => { setTier(String(value)); setSelected(""); }} />)}
    </>}
    toolbar={<span role="status" className="catalog-result-count">
      {t(eventTarget ? "reference.activity.count" : "reference.activity.nightmareCount", { count: filtered.length })}
    </span>}
    columns={[{ label: t("reference.adventure.region") }, { label: t("reference.detailsTab") }]}
    rows={filtered.map((item) => {
      const entry = item.variants.find((variant) => String(variant.activity?.tier) === tier) ?? item.variants[0];
      const artworkId = item.kind === "challenge" ? ACTIVITY_CHALLENGE_ARTWORK_ID(item.id) : undefined;
      const icon = (artworkId && artworkIcons[artworkId]) || item.variants.find((variant) => variant.icon)?.icon;
      const region = entry.activity?.region && entry.activity.region !== item.name ? gameText(entry.activity.region) : "";
      const variants = t(`reference.activity.${item.kind === "challenge" ? "levels" : "variants"}`, { count: item.variants.length });
      return { id: entry.id, label: gameText(item.name), subtitle: [region, variants].filter(Boolean).join(" · "),
        icon: icon && <img src={contentUrl(icon)} alt="" loading="lazy" className="size-[30px] rounded-[var(--radius-sm)] border border-border object-cover" />,
        cells: [region, variants] };
    })}
    onOpen={setSelected}
    onBack={() => setSelected("")}
    backLabel={t("reference.backToList")}
    detail={current && family && <div className="flex h-full min-h-0 flex-col">
      <ActivityDetail key={family.id} family={family} current={current} onSelect={setSelected} onOpenMap={onOpenMap} {...navigation} />
    </div>}
    emptyMessage={t("database.noMatches")}
  />;
};

export default ActivityBrowser;
