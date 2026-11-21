import { useMemo, useState } from "react";
import { Minus, Plus, Shirt, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../../components/item-icon";
import {
  ER_ATTRIBUTES,
  type ErAttribute,
  type ErClass,
  STAT_STORE_KEY,
  classesForBuild,
  erClasses,
  erStatHelp,
  erStatText,
  levelForBuild,
  wastedPoints,
} from "../../data/er-reference";
import { erItemByKey } from "../../data/er-items-data";
import { useMapStore } from "../../store/map-store";
import { useUiStore } from "../../store/ui-store";
import { cn } from "../../lib/cn";

/** The attribute colours the app already uses for scaling/requirement rows. */
const ATTR_COLOR: Record<ErAttribute, string> = {
  Vigor: "#e0655a",
  Mind: "#5aa8c9",
  Endurance: "#7ec98f",
  Strength: "#fb923c",
  Dexterity: "#a3e635",
  Intelligence: "#22d3ee",
  Faith: "#fde68a",
  Arcane: "#c084fc",
};

/** One editable attribute of the player's build. */
const BuildRow = ({
  attr,
  value,
  base,
  onChange,
}: {
  attr: ErAttribute;
  value: number;
  /** The selected class's floor — you can't level an attribute below where it starts. */
  base: number;
  onChange: (v: number) => void;
}) => {
  const { t } = useTranslation();
  const label = t(`stat.${attr}`, { defaultValue: attr });
  const below = value < base;
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[86px] shrink-0 truncate text-[12px] font-medium"
        style={{ color: ATTR_COLOR[attr] }}
        title={erStatText(attr)}
      >
        {label}
      </span>
      <button
        onClick={() => onChange(value - 1)}
        aria-label={`${label} −1`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/[0.06] text-zinc-400 transition-colors hover:bg-white/12 hover:text-white cursor-pointer"
      >
        <Minus size={12} aria-hidden="true" />
      </button>
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className={cn(
          "h-6 w-11 shrink-0 rounded-[var(--radius-sm)] border border-border bg-black/30 text-center text-[12.5px] font-semibold tabular-nums outline-none focus:border-accent/60",
          below ? "text-amber-300" : "text-zinc-100",
        )}
      />
      <button
        onClick={() => onChange(value + 1)}
        aria-label={`${label} +1`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/[0.06] text-zinc-400 transition-colors hover:bg-white/12 hover:text-white cursor-pointer"
      >
        <Plus size={12} aria-hidden="true" />
      </button>
    </div>
  );
};

const ClassDetail = ({ cls, build }: { cls: ErClass; build: Record<string, number> }) => {
  const { t } = useTranslation();
  const openCodexItem = useUiStore((s) => s.openCodexItem);
  const setPlayerStats = useMapStore((s) => s.setPlayerStats);
  const level = levelForBuild(cls, build);
  const waste = wastedPoints(cls, build);
  // The builder already walks the equipment fields in the game's own slot order.
  const gear = cls.gear;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {t("classes.startingClass")}
          </p>
          <h2 className="mt-0.5 font-display text-[24px] font-semibold leading-tight text-white">
            {cls.name}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            {t("classes.startsAtLevel", { level: cls.soulLevel })} ·{" "}
            {t("classes.flasks", { hp: cls.flasks.hp, fp: cls.flasks.fp })}
          </p>
        </div>
        <button
          onClick={() =>
            setPlayerStats(
              Object.fromEntries(ER_ATTRIBUTES.map((a) => [STAT_STORE_KEY[a], cls.stats[a] ?? 10])),
            )
          }
          className="shrink-0 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90 cursor-pointer"
        >
          {t("classes.useAsBuild")}
        </button>
      </header>

      {/* What THIS class costs to reach the build in the rail — the whole reason to compare. */}
      <section className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-semibold leading-none tabular-nums text-white">{level}</span>
          <span className="text-[12px] text-zinc-400">{t("classes.levelForYourBuild")}</span>
        </p>
        {waste > 0 ? (
          <p className="text-[12px] text-amber-300">{t("classes.wasted", { count: waste })}</p>
        ) : (
          <p className="text-[12px] text-emerald-300">{t("classes.noWaste")}</p>
        )}
      </section>

      {/* The class's own starting spread, next to what the build asks for. */}
      <section className="mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {t("classes.startingStats")}
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1">
          {ER_ATTRIBUTES.map((a) => {
            const base = cls.stats[a] ?? 10;
            const want = build[STAT_STORE_KEY[a]] ?? 10;
            const delta = want - base;
            return (
              <p key={a} className="flex items-baseline gap-2 text-[12.5px]" title={erStatText(a)}>
                <span className="flex-1 truncate" style={{ color: ATTR_COLOR[a] }}>
                  {t(`stat.${a}`, { defaultValue: a })}
                </span>
                <span className="font-semibold tabular-nums text-zinc-100">{base}</span>
                <span
                  className={cn(
                    "w-9 shrink-0 text-right tabular-nums",
                    delta > 0 ? "text-zinc-500" : delta < 0 ? "text-amber-400/80" : "text-zinc-700",
                  )}
                >
                  {delta > 0 ? `+${delta}` : delta < 0 ? delta : "—"}
                </span>
              </p>
            );
          })}
        </div>
      </section>

      {/* Starting kit — every piece is a real item, so every piece drills into its codex page. */}
      {gear.length > 0 && (
        <section className="mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {t("classes.startingGear")}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {gear.map((g) => {
              const item = erItemByKey.get(g.itemKey);
              return (
                <button
                  key={`${g.slot}-${g.itemId}`}
                  onClick={() => openCodexItem(g.itemKey)}
                  title={t("codex.showOnMap")}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft cursor-pointer"
                >
                  <ItemIcon
                    iconId={g.iconId}
                    category={item?.category ?? "consumable"}
                    color="#c9b15a"
                    glyph="sword"
                    size={26}
                  />
                  <span className="min-w-0 truncate text-[12.5px] text-zinc-100">{g.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* The game's OWN attribute explanations (GR_MenuText) — folded away, like the boss
          panel's status primer, so the page stays scannable. */}
      <details className="group mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02]">
        <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
          {t("classes.whatDoAttributesDo")}
          <span className="float-right text-subtle transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-2.5 border-t border-border px-3.5 py-3">
          {erStatHelp.attributes.map((h) => (
            <p key={h.key} className="text-[12px] leading-relaxed text-zinc-400">
              <span className="font-semibold" style={{ color: ATTR_COLOR[h.key as ErAttribute] ?? "#e4e4e7" }}>
                {t(`stat.${h.key}`, { defaultValue: h.label })}
              </span>{" "}
              — <span className="whitespace-pre-line">{h.text}</span>
            </p>
          ))}
        </div>
      </details>
    </div>
  );
};

/**
 * The starting-class browser — the game's 10 origins (CharaInitParam), and the one question
 * a player actually asks: *for the build I want, which class gets me there at the lowest
 * level?* Elden Ring charges one level per attribute point, so that's arithmetic over the
 * classes' starting spreads — no opinion needed, and the answer is exact.
 *
 * The build editor here is also the app's only place to set the character stats the codex's
 * attack-rating calculator reads, so the two features feed each other.
 */
const ClassBrowser = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const playerStats = useMapStore((s) => s.playerStats);
  const setPlayerStat = useMapStore((s) => s.setPlayerStat);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const ranked = useMemo(() => classesForBuild(playerStats), [playerStats]);
  const selected = erClasses.find((c) => c.id === selectedId) ?? ranked[0];
  const best = ranked[0];

  return (
    <div className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Shirt size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">
            {t("nav.classes")}
          </h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">
            {t("classes.subtitle")}
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("classes.close")}
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-80 shrink-0 flex-col border-r border-border">
          {/* The build. Everything to the right is scored against it. */}
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {t("classes.yourBuild")}
              </h2>
              <span className="text-[11px] text-zinc-500">
                {t("classes.level")}{" "}
                <span className="font-semibold tabular-nums text-zinc-200">
                  {levelForBuild(best, playerStats)}
                </span>
              </span>
            </div>
            <div className="space-y-1">
              {ER_ATTRIBUTES.map((a) => (
                <BuildRow
                  key={a}
                  attr={a}
                  value={playerStats[STAT_STORE_KEY[a]] ?? 10}
                  base={selected?.stats[a] ?? 10}
                  onChange={(v) => setPlayerStat(STAT_STORE_KEY[a], v)}
                />
              ))}
            </div>
            {best && (
              <p className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-accent-soft px-2.5 py-1.5 text-[11.5px] leading-relaxed text-accent">
                <Sparkles size={12} className="shrink-0" aria-hidden="true" />
                {t("classes.bestClass", { name: best.name, level: levelForBuild(best, playerStats) })}
              </p>
            )}
          </div>

          {/* Classes, cheapest-for-this-build first. */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {ranked.map((c) => {
              const level = levelForBuild(c, playerStats);
              const active = c.id === selected?.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border px-3 py-2 text-left transition-colors cursor-pointer",
                    active ? "bg-accent-soft" : "bg-white/[0.02] hover:bg-white/[0.06]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-white">{c.name}</span>
                    <span className="block text-[11px] text-zinc-500">
                      {t("classes.startsAtLevel", { level: c.soulLevel })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-semibold tabular-nums text-zinc-100">{level}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-subtle">
                      {t("classes.level")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected && <ClassDetail cls={selected} build={playerStats} />}
        </div>
      </div>
    </div>
  );
};

export default ClassBrowser;
