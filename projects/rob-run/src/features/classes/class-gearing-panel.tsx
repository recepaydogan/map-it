import { useEffect, useMemo, useState } from "react";
import { ArrowRight, SquareDashed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { useReferenceNavigation } from "../reference/reference-navigation-context";

interface GearSource { t: string; n?: string; prof?: string; skill?: number; count?: number; src?: string }
interface GearChoice { id: number; s: number; where: GearSource[] }
type GearSlots = Record<string, GearChoice[]>;
type GearMode = { derived?: boolean; "20": GearSlots; "30": GearSlots };
type ClassGearing = Record<string, { pve: GearMode; pvp: GearMode }>;

const SLOT_ORDER = ["head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger", "trinket", "main", "off", "ranged"] as const;
type GearSlot = typeof SLOT_ORDER[number];

const requests = new Map<string, Promise<ClassGearing>>();
const loadGearing = (id: string) => {
  if (!requests.has(id)) requests.set(id, fetch(contentUrl("data/classes/guides/" + id + "-gearing.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error("Class gearing: HTTP " + response.status);
      const data = await response.json() as ClassGearing;
      if (Object.keys(data).length !== 3) throw new Error("Incomplete gear guide for " + id);
      return data;
    }).catch((error: unknown) => { requests.delete(id); throw error; }));
  return requests.get(id)!;
};

const ClassGearingPanel = ({ classId, tree, mode, selectedLevel, embedded = false }: { classId: string; tree: string; mode: "pve" | "pvp"; cap: number; selectedLevel: number; embedded?: boolean }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const itemState = useItemCatalog();
  const [gearing, setGearing] = useState<ClassGearing | null>(null);
  const [error, setError] = useState(false);
  const [gearLevel, setGearLevel] = useState<20 | 30>(selectedLevel >= 30 ? 30 : 20);
  const [selectedSlot, setSelectedSlot] = useState<GearSlot>("main");
  const itemsById = useMemo(() => itemState.status === "ready" ? new Map(itemState.catalog.items.map((item) => [item.id, item])) : null, [itemState]);

  useEffect(() => {
    let active = true;
    void loadGearing(classId).then((data) => { if (active) setGearing(data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [classId]);

  const guide = gearing?.[tree]?.[mode];
  const slots = guide?.[String(gearLevel) as "20" | "30"];
  const visibleSlots = SLOT_ORDER.filter((slot) => slots?.[slot]?.length);
  const activeSlot = visibleSlots.includes(selectedSlot) ? selectedSlot : visibleSlots.includes("main") ? "main" : visibleSlots[0] ?? selectedSlot;
  const choices = slots?.[activeSlot] ?? [];
  const leftSlots = visibleSlots.slice(0, Math.ceil(visibleSlots.length / 2));
  const rightSlots = visibleSlots.slice(leftSlots.length);
  const slotName = (slot: string) => t("classGuide.gear.slot." + slot, { defaultValue: slot });
  const sourceText = (source: GearSource) => {
    const name = source.prof ?? source.n ?? "";
    if (source.t === "vendor" && !name) return t("classGuide.gear.source.vendorUnknown");
    return t("classGuide.gear.source." + source.t, { name, count: source.count ?? 0, defaultValue: source.t });
  };
  const sources = (choice: GearChoice) => choice.where.length > 0 ? <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-zinc-300">
    {choice.where.map((source, index) => <p key={index}>{sourceText(source)}</p>)}
  </div> : null;
  const slotButton = (slot: GearSlot) => {
    const first = slots?.[slot]?.[0];
    const item = first && itemsById?.get(String(first.id));
    const selected = activeSlot === slot;
    return <button key={slot} type="button" onClick={() => setSelectedSlot(slot)} aria-pressed={selected} aria-label={slotName(slot) + (item ? ": " + item.name : "")}
      className={cn("flex min-h-0 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border p-1 transition-colors focus-visible:outline-2 focus-visible:outline-accent @min-[700px]:flex-1 @min-[700px]:justify-start @min-[700px]:px-2", selected ? "border-white/35 bg-white/[0.09]" : "border-border bg-background/50 hover:border-white/25 hover:bg-white/[0.05]")}>
      {item ? <ItemIcon icon={item.icon} name={item.name} size={28} /> : <span className="grid size-7 shrink-0 place-items-center rounded border border-border"><SquareDashed size={15} aria-hidden="true" /></span>}
      <span className={cn("hidden min-w-0 truncate text-[11px] font-medium @min-[700px]:block", selected ? "text-white" : "text-zinc-300")}>{slotName(slot)}</span>
    </button>;
  };

  return <section className={cn("@container min-w-0 space-y-3", !embedded && "border-t border-border pt-3")} aria-label={t("classGuide.gear.title")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {!embedded && <h4 className="text-[13px] font-semibold text-white">{t("classGuide.gear.title")}</h4>}
      <div role="group" aria-label={t("classGuide.gear.levelSelect")} className="flex gap-1"> {([20, 30] as const).map((value) => <button key={value} type="button" onClick={() => setGearLevel(value)} aria-pressed={gearLevel === value} className={cn("min-h-8 cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-accent", gearLevel === value ? "border-white/25 bg-white/[0.08] text-white" : "border-border bg-transparent text-zinc-300 hover:bg-white/[0.04] hover:text-white")}>{t("classGuide.gear.level", { level: value })}</button>)}</div>
    </div>
    {(!slots || !itemsById) && <p role={error || itemState.status === "error" ? "alert" : "status"} className="rounded-[var(--radius-sm)] border border-border bg-surface p-3 text-[11px] text-zinc-300">{t(error || itemState.status === "error" ? "classGuide.gear.loadError" : "reference.loading")}</p>}
    {slots && itemsById && <div role="group" aria-label={t("classGuide.gear.slotSelect")} className="@container grid h-[408px] min-w-0 grid-cols-2 grid-rows-[96px_minmax(0,1fr)] gap-2 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface p-2 @min-[700px]:h-[344px] @min-[700px]:grid-cols-[148px_minmax(0,1fr)_148px] @min-[700px]:grid-rows-1">
      <div className="grid min-h-0 grid-cols-4 grid-rows-2 gap-1 @min-[700px]:col-start-1 @min-[700px]:row-start-1 @min-[700px]:flex @min-[700px]:flex-col">{leftSlots.map(slotButton)}</div>
      <div className="grid min-h-0 grid-cols-4 grid-rows-2 gap-1 @min-[700px]:col-start-3 @min-[700px]:row-start-1 @min-[700px]:flex @min-[700px]:flex-col">{rightSlots.map(slotButton)}</div>
      <div className="col-span-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-sm)] border border-border bg-white/[0.025] @min-[700px]:col-span-1 @min-[700px]:col-start-2 @min-[700px]:row-start-1">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h4 className="font-display text-sm font-semibold text-white">{slotName(activeSlot)}</h4>
          <span className="shrink-0 text-[11px] text-zinc-400">{t("classGuide.gear.level", { level: gearLevel })}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {guide?.derived && <p className="mb-2 text-[11px] leading-4 text-zinc-300">{t("classGuide.gear.derived")}</p>}
        {choices.length ? <ol className="space-y-2">{choices.map((choice, index) => {
          const item = itemsById.get(String(choice.id));
          return <li key={choice.id + "-" + index} className="flex min-w-0 items-center gap-2.5 border-t border-border px-1 pt-2 first:border-t-0 first:pt-0">
            {item && <ItemIcon icon={item.icon} name={item.name} size={28} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <button type="button" onClick={() => openReference({ category: "items", id: String(choice.id), name: item?.name })} className="cursor-pointer text-left text-[12px] font-semibold leading-5 text-zinc-100 hover:underline focus-visible:outline-2 focus-visible:outline-accent">{item?.name ?? "#" + choice.id}</button>
                <span className="rounded-[var(--radius-sm)] border border-border px-1.5 text-[10px] font-medium leading-4 text-zinc-400">{t(index === 0 ? "classGuide.gear.best" : "classGuide.gear.alternative")}</span>
              </div>
              {sources(choice)}
            </div>
            <button type="button" onClick={() => openReference({ category: "items", id: String(choice.id), name: item?.name })} aria-label={t("classGuide.gear.detailsFor", { name: item?.name ?? "#" + choice.id })} className="ml-auto inline-flex shrink-0 self-center cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent">
              {t("classGuide.gear.details")}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>;
        })}</ol> : <p className="text-[12px] leading-5 text-zinc-300">{t("classGuide.gear.noItems")}</p>}
        </div>
      </div>
    </div>}
  </section>;
};

export default ClassGearingPanel;
