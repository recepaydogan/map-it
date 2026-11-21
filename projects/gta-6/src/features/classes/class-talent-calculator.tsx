import { LockKeyhole, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { spellIconUrl } from "../spells/spell-data";
import TalentEffectText from "./talent-effect-text";
import TalentTreePopover from "./talent-tree-popover";
import { loadTalentCatalog } from "./talent-catalog";
import type { CalculatorClass, CalculatorTalent, CalculatorTree } from "./talent-calculator";
import { MAX_TALENT_POINTS, changeTalentRank, nextRankNumberChanges, resetTalentTree, restoreTalentOrder, talentCounts, talentLockReason, talentOrderGroups, treePoints } from "./talent-calculator";

function restoreOrder(classId: string, trees: CalculatorTree[]): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`talent-calculator:${classId}`) ?? "[]");
    return restoreTalentOrder(trees, value);
  } catch { return []; }
}

function saveOrder(classId: string, order: number[]) {
  try { localStorage.setItem(`talent-calculator:${classId}`, JSON.stringify(order)); } catch { /* Keep the current build usable without persistent storage. */ }
}

const TalentIcon = ({ id, size = 35, framed = false, dimmed = false }: { id: number; size?: number; framed?: boolean; dimmed?: boolean }) =>
  <img src={spellIconUrl(id)} alt="" width={size} height={size}
    className={cn("block shrink-0 object-contain", framed && "rounded-[var(--radius-sm)] border border-border bg-black", dimmed && "opacity-45")}
    style={{ width: size, height: size }} />;

const Tree = ({ tree, order, selectedId, onSelect, onLeave, onChange, onReset }: {
  tree: CalculatorTree;
  order: number[];
  selectedId: number | null;
  onSelect: (id: number, anchor: HTMLElement) => void;
  onLeave: () => void;
  onChange: (id: number, direction: 1 | -1) => void;
  onReset: () => void;
}) => {
  const { t } = useTranslation();
  const counts = talentCounts(order);
  const spent = treePoints(tree, counts);
  const talents = new Map(tree.talents.map((talent) => [`${talent.row}:${talent.col}`, talent]));
  const rows = Math.max(7, ...tree.talents.map((talent) => talent.row + 1));
  const columns = Math.max(3, ...tree.talents.map((talent) => talent.col + 1));
  return <section className="min-w-0 rounded-[var(--radius-md)] border border-border bg-surface p-3" aria-label={tree.n}>
    <div className="mb-3 flex items-center gap-2">
      <TalentIcon id={tree.ic} size={26} />
      <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{tree.n}</h3>
      <span className="text-[12px] font-semibold tabular-nums text-accent" aria-label={t("classes.calculator.treePoints", { count: spent })}>{spent}</span>
      <button type="button" onClick={onReset} disabled={!spent}
        aria-label={t("classes.calculator.resetTree", { tree: tree.n })}
        className="cursor-pointer rounded p-1 text-subtle hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"><RotateCcw size={14} /></button>
    </div>
    <div className="relative grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 51px)` }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full text-accent/60" viewBox={`0 0 ${columns * 100} ${rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
        {tree.talents.flatMap((talent) => talent.pre.map(([id, rankIndex]) => {
          const source = tree.talents.find((candidate) => candidate.id === id);
          if (!source) return null;
          const active = (counts.get(source.id) ?? 0) >= rankIndex + 1;
          return <polyline key={`${id}-${talent.id}`} points={`${source.col * 100 + 50},${source.row * 100 + 50} ${talent.col * 100 + 50},${talent.row * 100 + 50}`}
            fill="none" stroke="currentColor" strokeWidth={active ? 5 : 3} opacity={active ? 0.9 : 0.35} />;
        }))}
      </svg>
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        const talent = talents.get(`${row}:${col}`);
        if (!talent) return <span key={`${row}:${col}`} aria-hidden="true" />;
        const rank = counts.get(talent.id) ?? 0;
        const unavailable = talent.n === "Unknown talent";
        const lock = talentLockReason(tree, talent, counts, order.length);
        const canAdd = !unavailable && rank < talent.ranks.length && !lock;
        const label = `${talent.n}, ${rank}/${talent.ranks.length}`;
        return <button key={talent.id} type="button" onClick={(event) => { onSelect(talent.id, event.currentTarget); if (canAdd) onChange(talent.id, 1); }}
          onContextMenu={(event) => { event.preventDefault(); onSelect(talent.id, event.currentTarget); onChange(talent.id, -1); }}
          onPointerEnter={(event) => onSelect(talent.id, event.currentTarget)}
          onPointerLeave={(event) => { if (!event.currentTarget.matches(":focus-visible")) onLeave(); }}
          onFocus={(event) => onSelect(talent.id, event.currentTarget)} onBlur={onLeave}
          aria-label={label} aria-pressed={selectedId === talent.id}
          aria-describedby={selectedId === talent.id ? `talent-tooltip-${talent.id}` : undefined}
          className={cn("relative z-10 mx-auto size-11 cursor-pointer rounded border-2 bg-black p-0.5 text-left shadow-md transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            rank ? "border-amber-500" : !canAdd ? "border-zinc-700" : "border-zinc-600", selectedId === talent.id && "ring-2 ring-accent") }>
          <TalentIcon id={talent.ic} size={37} dimmed={!rank && !canAdd} />
          <span className={cn("absolute -bottom-1 -right-1 rounded-sm bg-black px-0.5 text-[10px] font-bold leading-4 tabular-nums", rank === talent.ranks.length ? "text-amber-300" : rank ? "text-lime-300" : "text-zinc-200")}>{rank}/{talent.ranks.length}</span>
        </button>;
      })}
    </div>
  </section>;
};

const SelectedTalent = ({ talent, tree, order }: { talent: CalculatorTalent; tree: CalculatorTree; order: number[] }) => {
  const { t } = useTranslation();
  const counts = talentCounts(order);
  const rank = counts.get(talent.id) ?? 0;
  const lock = talentLockReason(tree, talent, counts, order.length);
  const description = talent.d[Math.max(rank - 1, 0)];
  const nextDescription = rank > 0 && rank < talent.ranks.length ? talent.d[rank] : null;
  const nextChange = nextDescription ? nextRankNumberChanges(description ?? "", nextDescription) : null;
  const unavailable = talent.n === "Unknown talent";
  const progress = lock?.kind === "tier" || lock?.kind === "prerequisite"
    ? Math.min(100, Math.round(lock.current / lock.needed * 100)) : null;
  const lockMessage = unavailable ? t("classes.calculator.unknown")
    : lock?.kind === "tier" ? t("classes.calculator.tierProgress", { current: lock.current, needed: lock.needed, tree: tree.n })
    : lock?.kind === "prerequisite" ? t("classes.calculator.prerequisiteProgress", { current: lock.current, needed: lock.needed, name: lock.talent.n })
    : lock?.kind === "points" && rank < talent.ranks.length ? t("classes.calculator.noPoints") : null;
  return <div className="overflow-hidden rounded-[var(--radius-md)] border border-amber-400/30 bg-elevated shadow-[0_16px_44px_rgba(0,0,0,0.65)]" aria-label={talent.n}>
    <div className="flex items-start gap-2.5 p-3">
      <TalentIcon id={talent.ic} size={40} framed />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold leading-[18px] text-white">{talent.n}</h3>
            <p className="mt-0.5 text-[10px] text-subtle">{tree.n} · {t("classes.calculator.tier", { tier: talent.row + 1 })}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span aria-label={t("classes.calculator.rankCount", { rank, max: talent.ranks.length })}
              className={cn("rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", rank ? "bg-accent-soft text-accent" : "border border-border text-zinc-300")}>{rank}/{talent.ranks.length}</span>
          </div>
        </div>
      </div>
    </div>
    <div className="border-t border-border/70 px-3 pb-3 pt-2.5">
      {talent.header?.map((line, index) => <p key={index} className="mt-1 text-[11px] text-zinc-300"><TalentEffectText text={line.join(" · ")} /></p>)}
      {talent.requires?.map((requirement, index) => <p key={index} className="mt-1 text-[11px] text-amber-200">{requirement}</p>)}
      {description && <div className="mt-2">
        {rank === 0 && <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-subtle">{t("classes.calculator.rankPreview")}</p>}
        <p className="text-[12px] leading-[18px] text-zinc-100"><TalentEffectText text={description} /></p>
      </div>}
      {nextDescription && <p className="mt-2 text-[11px] leading-[16px] text-accent"><span className="font-semibold">{t("classes.calculator.nextRank")} </span><TalentEffectText text={nextChange ?? nextDescription} /></p>}
      {talent.pre.length > 0 && !lock && <p className="mt-2 text-[10px] text-subtle">{talent.pre.map(([id, index]) => {
          const prerequisite = tree.talents.find((candidate) => candidate.id === id);
          return prerequisite ? t("classes.calculator.prerequisite", { name: prerequisite.n, rank: index + 1 }) : "";
        }).filter(Boolean).join(" · ")}</p>}
    </div>
    {lockMessage && <div className="border-t border-border bg-black/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <LockKeyhole size={12} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[10px] font-medium text-amber-200">{lockMessage}</span>
      </div>
      {progress !== null && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/50" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></div>}
    </div>}
  </div>;
};

const BuildEffects = ({ trees, order }: { trees: CalculatorTree[]; order: number[] }) => {
  const { t } = useTranslation();
  const counts = talentCounts(order);
  const groups = trees.map((tree) => ({
    tree,
    talents: tree.talents.filter((talent) => (counts.get(talent.id) ?? 0) > 0)
      .sort((a, b) => a.row - b.row || a.col - b.col),
  })).filter((group) => group.talents.length > 0);

  return <section className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface" aria-label={t("classes.calculator.effectsTitle")}>
    <div className="border-b border-border px-3 py-3 @min-[600px]:px-4">
      <h3 className="text-[13px] font-semibold text-white">{t("classes.calculator.effectsTitle")}</h3>
      <p className="mt-1 text-[11px] text-subtle">{t("classes.calculator.effectsHint")}</p>
    </div>
    {groups.length ? <table className="w-full table-fixed border-collapse text-left">
      <colgroup><col className="w-[39%] @min-[700px]:w-[29%]" /><col className="w-[48px] @min-[700px]:w-[68px]" /><col /></colgroup>
      <thead className="bg-white/[0.025] text-[10px] font-semibold uppercase tracking-wide text-subtle">
        <tr>
          <th scope="col" className="px-3 py-2 @min-[600px]:px-4">{t("classes.calculator.effectsTalent")}</th>
          <th scope="col" className="px-1 py-2 text-center">{t("classes.calculator.orderRank")}</th>
          <th scope="col" className="px-2 py-2 @min-[600px]:px-4">{t("classes.calculator.effectsCurrent")}</th>
        </tr>
      </thead>
      {groups.map(({ tree, talents }) => <tbody key={tree.n}>
        <tr className="border-y border-border bg-accent/[0.055]">
          <th scope="rowgroup" colSpan={3} className="px-3 py-2 text-left @min-[600px]:px-4">
            <div className="flex items-center gap-2">
              <TalentIcon id={tree.ic} size={21} />
              <span className="text-[11px] font-semibold text-white">{tree.n}</span>
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-accent">{t("classes.calculator.treePoints", { count: treePoints(tree, counts) })}</span>
            </div>
          </th>
        </tr>
        {talents.map((talent) => {
          const rank = counts.get(talent.id)!;
          return <tr key={talent.id} className="border-b border-border/70 align-top last:border-b-0 hover:bg-white/[0.025]">
            <th scope="row" className="px-3 py-3 text-left font-normal @min-[600px]:px-4">
              <div className="flex items-start gap-2">
                <TalentIcon id={talent.ic} size={28} framed />
                <div className="min-w-0 pt-0.5">
                  <span className="block break-words text-[11px] font-semibold leading-[16px] text-white">{talent.n}</span>
                  {talent.passive === false && <span className="mt-1 block text-[10px] font-medium text-accent">{t("classes.calculator.effectsAbility")}</span>}
                </div>
              </div>
            </th>
            <td className="px-1 py-3 text-center text-[11px] font-semibold tabular-nums text-accent">{rank}/{talent.ranks.length}</td>
            <td className="px-2 py-3 @min-[600px]:px-4">
              {talent.header?.map((line, index) => <p key={index} className="mb-1 text-[10px] leading-[15px] text-subtle"><TalentEffectText text={line.join(" · ")} /></p>)}
              <p className="break-words text-[11px] leading-[17px] text-zinc-200"><TalentEffectText text={talent.d[rank - 1]} /></p>
              {talent.requires?.map((requirement, index) => <p key={index} className="mt-1 text-[10px] leading-[15px] text-amber-200">{requirement}</p>)}
            </td>
          </tr>;
        })}
      </tbody>)}
    </table> : <p className="px-3 py-5 text-[12px] text-subtle @min-[600px]:px-4">{t("classes.calculator.effectsEmpty")}</p>}
  </section>;
};

const ClassTalentCalculator = ({ classId }: { classId: string }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<CalculatorClass | null>(null);
  const [error, setError] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setSelected(null), 140);
  };
  const select = (id: number, anchor: HTMLElement) => {
    cancelClose();
    setSelected((current) => current?.id === id && current.anchor === anchor ? current : { id, anchor });
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    let active = true;
    void loadTalentCatalog().then((classes) => {
      if (!active) return;
      const found = classes.find((entry) => entry.n.toLowerCase() === classId);
      if (!found) throw new Error(`Missing talents for ${classId}`);
      setData(found);
      setOrder(restoreOrder(classId, found.trees));
    }).catch((cause: unknown) => { console.error("Failed to load talents", cause); if (active) setError(true); });
    return () => { active = false; };
  }, [classId]);
  const selectedTalent = useMemo(() => data?.trees.flatMap((tree) => tree.talents.map((talent) => ({ tree, talent }))).find((item) => item.talent.id === selected?.id), [data, selected?.id]);
  const change = (id: number, direction: 1 | -1) => {
    if (!data) return;
    setOrder((current) => {
      const next = changeTalentRank(data.trees, current, id, direction);
      if (next !== current) saveOrder(classId, next);
      return next;
    });
  };
  const reset = (tree?: CalculatorTree) => {
    setOrder((current) => {
      const next = tree ? resetTalentTree(tree, current) : [];
      saveOrder(classId, next);
      return next;
    });
  };
  if (error) return <p role="alert" className="text-[12px] text-muted">{t("classes.calculator.loadError")}</p>;
  if (!data) return <p role="status" className="text-[12px] text-muted">{t("classes.calculator.loading")}</p>;
  const groups = talentOrderGroups(data.trees, order);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="font-display text-lg font-semibold text-white">{t("classes.calculator.classTitle", { name: data.n })}</h2>
        <p className="text-[11px] text-subtle">{t("classes.calculator.clickHint")}</p>
      </div>
      <span className="ml-auto text-[12px] font-semibold tabular-nums text-accent">{t("classes.calculator.pointsLeft", { count: MAX_TALENT_POINTS - order.length })}</span>
      <button type="button" onClick={() => reset()} disabled={!order.length} className="cursor-pointer rounded border border-border px-2 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40">{t("classes.calculator.resetAll")}</button>
    </div>
    <div className="grid items-start gap-2 @min-[590px]:grid-cols-2 @min-[760px]:grid-cols-3">
      {data.trees.map((tree) => <Tree key={tree.n} tree={tree} order={order} selectedId={selected?.id ?? null} onSelect={select} onLeave={scheduleClose} onChange={change} onReset={() => reset(tree)} />)}
    </div>
    {selected && selectedTalent && <TalentTreePopover anchor={selected.anchor} id={`talent-tooltip-${selected.id}`} label={selectedTalent.talent.n}
      onDismiss={() => { cancelClose(); setSelected(null); }}>
      <SelectedTalent talent={selectedTalent.talent} tree={selectedTalent.tree} order={order} />
    </TalentTreePopover>}
    <section className="rounded-[var(--radius-md)] border border-border bg-surface p-3" aria-label={t("classes.calculator.order")}>
      <h3 className="text-[13px] font-semibold text-white">{t("classes.calculator.order")}</h3>
      {groups.length ? <><p className="mt-1 text-[11px] text-subtle">{t("classes.calculator.orderHint")}</p><ol className="mt-3 gap-x-2 @min-[720px]:columns-2">
        {groups.map((group, index) => <li key={`${group.id}-${index}`} className="mb-2 flex min-w-0 break-inside-avoid items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2">
          <div className="w-[66px] shrink-0 border-r border-border pr-2">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-subtle">{t("classes.calculator.orderLevel")}</span>
            <span className="block whitespace-nowrap text-[14px] font-semibold tabular-nums text-accent">{group.from === group.to ? group.from : `${group.from}–${group.to}`}</span>
          </div>
          <TalentIcon id={group.icon} size={32} />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-white">{group.name}</span>
            <span className="block truncate text-[11px] text-subtle">{group.tree}</span>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-subtle">{t("classes.calculator.orderRank")}</span>
            <span className="block text-[12px] font-semibold tabular-nums text-zinc-200">{group.rankFrom === group.rankTo ? group.rankFrom : `${group.rankFrom}–${group.rankTo}`}/{group.maxRank}</span>
          </div>
        </li>)}
      </ol></> : <p className="mt-1 text-[11px] text-subtle">{t("classes.calculator.emptyOrder")}</p>}
    </section>
    <BuildEffects trees={data.trees} order={order} />
  </div>;
};

export default ClassTalentCalculator;
