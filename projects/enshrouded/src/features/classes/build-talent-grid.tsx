import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import SpellIcon from "../spells/spell-icon";
import { useSpellDetail } from "../spells/spell-data";
import { getSpellDescription } from "../spells/spell-description";
import { loadTalentCatalog } from "./talent-catalog";
import TalentEffectText from "./talent-effect-text";
import TalentTreePopover from "./talent-tree-popover";
import type { CalculatorClass } from "./talent-calculator";
import type { ClassBuild, ClassGuideBundle, ClassGuideTalentTree } from "./use-class-guide-bundle";

const BuildTree = ({ tree, points, rows, selectedId, onSelect, onLeave }: {
  tree: ClassGuideTalentTree;
  points: Record<string, number>;
  rows: number;
  selectedId: string | null;
  onSelect: (id: string, anchor: HTMLElement) => void;
  onLeave: () => void;
}) => {
  const { t } = useTranslation();
  const visible = tree.talents.filter((talent) => talent.row < rows && talent.n !== "Unknown talent");
  const total = tree.talents.reduce((sum, talent) => sum + (points[String(talent.id)] ?? 0), 0);

  return <section aria-label={tree.n} className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-elevated p-3">
    <div className="flex items-center gap-2 border-b border-border pb-2.5">
      <SpellIcon id={tree.ic} name={tree.n} size={24} />
      <h5 className="min-w-0 flex-1 text-[12px] font-semibold text-white">{tree.n}</h5>
      <span className="text-[11px] font-semibold tabular-nums text-accent">{t("classGuide.full.pointsAllocated", { count: total })}</span>
    </div>
    <div className="relative mx-auto mt-3 grid grid-cols-4 gap-2" style={{ gridTemplateRows: `repeat(${rows}, 50px)`, maxWidth: 300 }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 400 ${rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
        {visible.flatMap((talent) => talent.pre.map(([id, requiredRank]) => {
          const source = tree.talents.find((candidate) => candidate.id === id);
          if (!source || source.row >= rows) return null;
          const active = (points[String(id)] ?? 0) >= requiredRank + 1 && (points[String(talent.id)] ?? 0) > 0;
          return <line key={`${id}-${talent.id}`} x1={source.col * 100 + 50} y1={source.row * 100 + 50} x2={talent.col * 100 + 50} y2={talent.row * 100 + 50}
            stroke={active ? "var(--color-accent)" : "var(--color-zinc-700)"} strokeWidth={active ? 5 : 3} opacity={active ? 0.8 : 0.5} />;
        }))}
      </svg>
      {visible.map((talent) => {
        const id = String(talent.id);
        const rank = points[id] ?? 0;
        const selected = selectedId === id;
        return <button key={id} type="button"
          onPointerEnter={(event) => onSelect(id, event.currentTarget)}
          onPointerLeave={(event) => { if (!event.currentTarget.matches(":focus-visible")) onLeave(); }}
          onFocus={(event) => onSelect(id, event.currentTarget)} onBlur={onLeave}
          aria-label={`${talent.n}, ${t("classes.calculator.rankCount", { rank, max: talent.ranks.length })}`}
          aria-describedby={selected ? `build-talent-tooltip-${id}` : undefined}
          style={{ gridRow: talent.row + 1, gridColumn: talent.col + 1, opacity: rank || selected ? 1 : 0.42 }}
          className={cn("relative z-10 mx-auto flex size-11 cursor-help items-center justify-center rounded-[var(--radius-sm)] border bg-black p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            rank ? "border-accent/70 hover:border-accent" : "border-border", selected && "ring-2 ring-accent")}>
          <SpellIcon id={talent.ic} name={talent.n} size={36} />
          {rank > 0 && <span className="absolute -bottom-1 -right-1 rounded-[var(--radius-sm)] bg-black px-1 text-[10px] font-bold leading-4 tabular-nums text-accent">{rank}/{talent.ranks.length}</span>}
        </button>;
      })}
    </div>
  </section>;
};

const BuildTalentGrid = ({ build, bundle }: { build: ClassBuild; bundle: ClassGuideBundle }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [catalog, setCatalog] = useState<{ classes: CalculatorClass[] | null; loaded: boolean }>({ classes: null, loaded: false });
  useEffect(() => {
    let active = true;
    void loadTalentCatalog().then((classes) => { if (active) setCatalog({ classes, loaded: true }); }).catch((cause: unknown) => {
      console.error("Failed to load talent descriptions", cause);
      if (active) setCatalog({ classes: null, loaded: true });
    });
    return () => { active = false; };
  }, []);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setSelected(null), 160);
  };
  const select = (id: string, anchor: HTMLElement) => {
    cancelClose();
    setSelected((current) => current?.id === id && current.anchor === anchor ? current : { id, anchor });
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const entries = Object.entries(build.points);
  const total = entries.reduce((sum, [, points]) => sum + points, 0);
  const talents = bundle.talentTrees.flatMap((tree) => tree.talents);
  const talentIds = new Set(talents.map((talent) => String(talent.id)));
  const trees = bundle.talentTrees.filter((tree) => tree.talents.some((talent) => (build.points[String(talent.id)] ?? 0) > 0));
  const rows = Math.max(7, ...trees.flatMap((tree) => tree.talents.map((talent) => talent.row + 1)));
  const selectedTalent = selected ? talents.find((talent) => String(talent.id) === selected.id) : null;
  const selectedTree = selected ? bundle.talentTrees.find((tree) => tree.talents.some((talent) => String(talent.id) === selected.id)) : null;
  const rank = selected ? build.points[selected.id] ?? 0 : 0;
  const reason = selected ? build.why[selected.id] : null;
  const spellId = selectedTalent?.ranks[Math.max(rank - 1, 0)] ?? null;
  const { detail } = useSpellDetail(spellId);
  const matchingTalents = catalog.classes?.find((entry) => entry.n.toLowerCase() === bundle.classId)
    ?.trees.find((tree) => tree.n === selectedTree?.n)
    ?.talents.filter((talent) => talent.n === selectedTalent?.n && talent.ic === selectedTalent.ic && talent.ranks.length === selectedTalent.ranks.length);
  const calculatorTalent = matchingTalents?.length === 1 ? matchingTalents[0] : null;
  const description = calculatorTalent?.d[Math.max(rank - 1, 0)]?.trim() || (catalog.loaded ? getSpellDescription(detail?.d, detail?.a) : "");
  const unmapped = entries.filter(([id]) => !talentIds.has(id));

  return <div>
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("classGuide.full.talentPoints")}</h4>
      <span className="text-[11px] tabular-nums text-zinc-300">{t("classGuide.full.pointsAllocated", { count: total })}</span>
    </div>
    <div className={cn("mt-2 grid gap-3", trees.length === 1 ? "mx-auto" : trees.length === 2 ? "@min-[640px]:grid-cols-2" : "@min-[850px]:grid-cols-3")}
      style={trees.length === 1 ? { maxWidth: 360, width: "100%" } : undefined}>
      {trees.map((tree) => <BuildTree key={tree.n} tree={tree} points={build.points} rows={rows} selectedId={selected?.id ?? null} onSelect={select} onLeave={scheduleClose} />)}
    </div>
    {unmapped.length > 0 && <ul className="mt-3 grid gap-2 @min-[500px]:grid-cols-2">{unmapped.map(([id, points]) => <li key={id} className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-[12px] text-zinc-200">{bundle.talentsById.get(id)?.name ?? `#${id}`} · {points}×</li>)}</ul>}
    {selected && selectedTalent && <TalentTreePopover anchor={selected.anchor} id={`build-talent-tooltip-${selected.id}`} label={selectedTalent.n}
      onDismiss={() => { cancelClose(); setSelected(null); }}>
      <div className="rounded-[var(--radius-sm)] border border-accent/40 bg-elevated px-3 py-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.65)]">
        <div className="flex items-baseline justify-between gap-3">
          <h5 className="text-[12px] font-semibold text-white">{selectedTalent.n}</h5>
          <span className="shrink-0 text-[11px] tabular-nums text-subtle">{t("classes.calculator.rankCount", { rank, max: selectedTalent.ranks.length })}</span>
        </div>
        {rank === 0 && <p className="mt-1 text-[10px] font-medium text-subtle">{t("classes.calculator.rankPreview")}</p>}
        {(calculatorTalent?.passive ?? detail?.pa) && <p className="mt-1 text-[10px] text-subtle">{t("spells.passive")}</p>}
        {description && <p className="mt-1.5 text-[12px] leading-5 text-zinc-100"><TalentEffectText text={description} /></p>}
        {reason && <div className="mt-2 border-t border-border pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("classGuide.full.buildReason")}</p>
          <p className="mt-1 text-[11px] leading-[17px] text-zinc-300"><TalentEffectText text={reason} /></p>
        </div>}
      </div>
    </TalentTreePopover>}
  </div>;
};

export default BuildTalentGrid;
