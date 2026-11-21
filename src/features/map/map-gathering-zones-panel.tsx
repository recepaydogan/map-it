import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { cn } from "../../lib/cn";
import CategoryDropdown from "../../components/category-dropdown";

export interface GatheringZone {
  id: string;
  name: string;
  uiMapId: number;
  questLevels: string;
  x: number;
  y: number;
  herbs: { name: string; count: number }[];
  ore: { name: string; count: number }[];
  fishing: { safeSkill: number; pool?: string } | null;
  skinning: { from: number; to: number }[];
}

interface GatheringCatalog { version: 2; zones: GatheringZone[] }
let catalogRequest: Promise<GatheringCatalog> | null = null;
const loadCatalog = () => {
  catalogRequest ??= fetch(contentUrl("data/gathering/zones.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Gathering zones: HTTP ${response.status}`);
    const value = await response.json() as GatheringCatalog;
    if (value.version !== 2 || !Array.isArray(value.zones)
      || value.zones.some((zone) => !Array.isArray(zone.herbs) || !Array.isArray(zone.ore)
        || !Array.isArray(zone.skinning))) throw new Error("Invalid gathering catalog");
    return value;
  }).catch((error: unknown) => { catalogRequest = null; throw error; });
  return catalogRequest;
};

interface MapGatheringZonesPanelProps {
  onFocusZone: (zone: GatheringZone) => void;
}

const MapGatheringZonesPanel = ({ onFocusZone }: MapGatheringZonesPanelProps) => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<GatheringCatalog | null>(null);
  const [error, setError] = useState(false);
  const [profession, setProfession] = useState<"herbs" | "ore" | "fishing" | "skinning">("herbs");
  const [resource, setResource] = useState("");
  useEffect(() => {
    let active = true;
    void loadCatalog().then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const resources = useMemo(() => profession === "herbs" || profession === "ore"
    ? [...new Set((catalog?.zones ?? []).flatMap((zone) => zone[profession].map((item) => item.name)))].sort()
    : [], [catalog, profession]);
  const zones = useMemo(() => (catalog?.zones ?? []).flatMap((zone) => {
    if (profession === "herbs" || profession === "ore") {
      const items = zone[profession].filter((item) => !resource || item.name === resource);
      return items.length ? [{ zone, detail: items.slice(0, 4).map((item) => `${item.name} ${item.count}`).join(" · "),
        order: -items.reduce((sum, item) => sum + item.count, 0) }] : [];
    }
    if (profession === "fishing") return zone.fishing
      ? [{ zone, detail: [t("map.gathering.fishingSafeSkill", { skill: zone.fishing.safeSkill }), zone.fishing.pool]
        .filter(Boolean).join(" · "), order: zone.fishing.safeSkill }] : [];
    return zone.skinning.length ? [{ zone,
      detail: zone.skinning.map(({ from, to }) => t("map.gathering.skinningRange", { from, to })).join(" · "),
      order: zone.skinning[0]!.from }] : [];
  }).sort((a, b) => a.order - b.order || a.zone.name.localeCompare(b.zone.name)),
  [catalog, profession, resource, t]);

  return <div className="space-y-3">
    <p className="text-[10px] leading-4 text-zinc-400">{t("map.gathering.classicNotice")}</p>
    <div className="grid grid-cols-2 gap-1" role="toolbar" aria-label={t("map.gathering.title")}>
      {(["herbs", "ore", "fishing", "skinning"] as const).map((value) => <button type="button" key={value}
        aria-pressed={profession === value} onClick={() => { setProfession(value); setResource(""); }}
        className={cn("cursor-pointer rounded-[var(--radius-full)] border px-2.5 py-1 text-[10px] font-semibold",
          profession === value ? "border-accent/40 bg-accent-soft text-white" : "border-border text-zinc-300 hover:bg-white/5")}
      >{t(`professions.names.${value === "herbs" ? "herbalism" : value === "ore" ? "mining" : value}`)}</button>)}
    </div>
    {(profession === "herbs" || profession === "ore") && <CategoryDropdown value={resource} onChange={setResource} ariaLabel={t("map.gathering.resource")}
      triggerClassName="text-[11px]" options={[{ key: "", label: t("map.gathering.allResources") },
        ...resources.map((name) => ({ key: name, label: name }))]} />}
    {error && <p role="alert" className="text-[11px] text-danger-text">{t("map.gathering.loadError")}</p>}
    {!catalog && !error && <p role="status" className="text-[11px] text-zinc-400">{t("reference.loading")}</p>}
    {catalog && <div className="space-y-1.5">
      {zones.map(({ zone, detail }) => <button type="button" key={zone.id} onClick={() => onFocusZone(zone)}
        className="w-full cursor-pointer rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2.5 text-left hover:border-accent/35 hover:bg-accent-soft">
        <span className="flex items-center justify-between gap-2 text-[12px] font-semibold text-zinc-100">
          <span>{zone.name}</span>
          <span className="text-[10px] font-normal text-zinc-400">{t("map.gathering.levels", { levels: zone.questLevels })}</span>
        </span>
        <span className="mt-1 block text-[10px] leading-4 text-zinc-400">
          {detail}
        </span>
      </button>)}
    </div>}
    <p className="text-[10px] leading-4 text-zinc-500">{t("map.gathering.personalLoopHint")}</p>
  </div>;
};

export default MapGatheringZonesPanel;
