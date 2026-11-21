import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ChevronLeft, Coins, Gauge, Gem, Heart, Package, Search, Shield, ShieldAlert, SlidersHorizontal,
  Sparkles, Swords, User, X, Zap,
} from "lucide-react";
import {
  nrRelics, nrNightfarers, nrNightlordMeta, type DeepRelic, type RelicColor, type RelicEffect,
} from "../../data/nightreign-data";
import { useDataVersion } from "../../data/localized-data";
import Dropdown from "../../components/dropdown";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

// nrRelics is a LIVE binding rebuilt when the language changes, so read through it on
// every access — destructuring at module scope would freeze the English arrays.
const colorById = (id: number) => nrRelics.colors.find((c) => c.id === id);

const vesselSrc = (id: number | null) => (id != null ? `/icons/nightreign/relics/${id}.png` : null);
const statusSrc = (id: number | null) => (id != null ? `/icons/nightreign/status/${id}.png` : null);
const nightlordSrc = (name: string | null) => {
  const ic = name ? nrNightlordMeta.get(name)?.iconId : undefined;
  return ic != null ? `/icons/nightreign/menu/${ic}.png` : null;
};
/** Character-specific effects ("[Duchess] …") get that hero's real portrait as the icon. */
const heroPortrait = (hero: string | null) => {
  const n = hero ? nrNightfarers.find((nf) => nf.name === hero) : undefined;
  return n ? `/icons/nightreign/menu/${n.smallPortraitId}.png` : null;
};

/** Per-category glyph + hue, used for section headers and as the (rare) fallback icon. */
const CAT_META: Record<string, { Icon: typeof Shield; hue: string }> = {
  character: { Icon: User, hue: "#c084fc" },
  attribute: { Icon: Gauge, hue: "#a3e635" },
  offense: { Icon: Swords, hue: "#fb7a4a" },
  defense: { Icon: Shield, hue: "#5aa9e8" },
  recovery: { Icon: Heart, hue: "#4ade80" },
  art: { Icon: Zap, hue: "#fbbf24" },
  gear: { Icon: Package, hue: "#38bdf8" },
  utility: { Icon: Coins, hue: "#d4b483" },
};
/** Category id → localized section label. The English data label is the fallback,
 *  so a not-yet-translated category still reads sensibly. */
const catLabel = (t: TFunction, id: string) =>
  t(`nightreign.relicCat.${id}`, { defaultValue: nrRelics.categories.find((c) => c.id === id)?.label ?? id });

/** Elden Ring stat hues, so a "Vigor +3" relic effect reads the same colour as everywhere else. */
const STAT_COLOR: Record<string, string> = {
  Vigor: "#f87171", Mind: "#60a5fa", Endurance: "#4ade80", Strength: "#fb923c",
  Dexterity: "#a3e635", Intelligence: "#22d3ee", Faith: "#fde68a", Arcane: "#c084fc",
};
/** Weakness/affinity hues for the Nightlord chips. */
const ELEMENT_COLOR: Record<string, string> = {
  Magic: "#5aa9e8", Fire: "#fb7a4a", Lightning: "#fbbf24", Holy: "#fde68a",
  Poison: "#a3e635", "Scarlet Rot": "#f97316", Rot: "#f97316", Sleep: "#c4b5fd",
  Madness: "#fb7185", Frost: "#7dd3fc", Frostbite: "#7dd3fc", Bleed: "#ef4444",
};

const heroTag = (name: string) => {
  const m = name.match(/^\[([^\]]+)\]\s*(.*)$/);
  return m ? { hero: m[1], text: m[2] } : { hero: null, text: name };
};

/** The icon tile shared by every effect row. Game icons carry a built-in transparent margin, so
 *  status icons are pre-trimmed at extraction and shown nearly edge-to-edge; hero portraits are
 *  full-bleed faces (object-cover). */
const EffectIcon = ({ e, hue, size }: { e: RelicEffect; hue: string; size: number }) => {
  const { hero } = heroTag(e.name);
  const portrait = hero ? heroPortrait(hero) : null;
  const src = statusSrc(e.icon);
  const Glyph = (CAT_META[e.cat] ?? CAT_META.utility).Icon;
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)]"
      style={{ width: size, height: size, backgroundColor: `${hue}1a`, boxShadow: `inset 0 0 0 1px ${hue}33` }}
    >
      {portrait ? (
        <img src={portrait} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : src ? (
        <img src={src} alt="" draggable={false} className="h-full w-full object-contain p-[2px]" />
      ) : (
        <Glyph size={Math.round(size * 0.55)} style={{ color: hue }} aria-hidden="true" />
      )}
    </span>
  );
};

/** One relic effect: its in-game icon + readable text, vertically centred, wrapping sensibly. */
const EffectChip = ({ e }: { e: RelicEffect }) => {
  const meta = CAT_META[e.cat] ?? CAT_META.utility;
  const { hero, text } = heroTag(e.name);
  const statHue = e.cat === "attribute" ? STAT_COLOR[e.name.split(/\s*[+\-]/)[0].trim()] : undefined;
  const hue = statHue ?? meta.hue;
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-2.5 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
      <EffectIcon e={e} hue={hue} size={36} />
      <span className="min-w-0 text-pretty text-[12.5px] leading-snug text-zinc-200">
        {hero && (
          <span
            className="mr-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${meta.hue}22`, color: meta.hue }}
          >
            {hero}
          </span>
        )}
        {text}
      </span>
    </div>
  );
};

/** Effects of one colour, grouped into category sections, with a category dropdown + search. */
const ColorView = ({ c }: { c: RelicColor }) => {
  const { t } = useTranslation();
  const dataVersion = useDataVersion((s) => s.version);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCat = new Map<string, RelicEffect[]>();
    for (const e of c.effects) {
      if (q && !e.name.toLowerCase().includes(q)) continue;
      if (!byCat.has(e.cat)) byCat.set(e.cat, []);
      byCat.get(e.cat)!.push(e);
    }
    return nrRelics.categories
      .map((cat) => ({ cat: cat.id, effects: byCat.get(cat.id) ?? [] }))
      .filter((g) => g.effects.length > 0 && (!activeCat || g.cat === activeCat));
  }, [c.effects, query, activeCat, dataVersion]);

  const shownCount = groups.reduce((n, g) => n + g.effects.length, 0);
  const presentCats = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of c.effects) count.set(e.cat, (count.get(e.cat) ?? 0) + 1);
    return nrRelics.categories.filter((cat) => count.has(cat.id)).map((cat) => ({ ...cat, n: count.get(cat.id)! }));
  }, [c.effects, dataVersion]);

  const catOptions = [
    { value: "__all", label: t("nightreign.allCategories", { n: c.effects.length }) },
    ...presentCats.map((cat) => ({ value: cat.id, label: `${catLabel(t, cat.id)} (${cat.n})` })),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Scene banner */}
      <div className="relative overflow-hidden border-b border-border px-4 pb-4 pt-6 sm:px-6">
        <div
          className="pointer-events-none absolute -left-10 -top-20 h-56 w-56 opacity-50 blur-2xl"
          style={{ background: `radial-gradient(circle, ${c.color}66, transparent 70%)` }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-[var(--radius-full)] blur-md" style={{ background: `radial-gradient(circle, ${c.color}aa, transparent 70%)` }} aria-hidden="true" />
            {vesselSrc(c.vessel) ? (
              <img src={vesselSrc(c.vessel)!} alt="" draggable={false} className="relative h-16 w-16 object-contain drop-shadow" />
            ) : (
              <span className="relative grid h-16 w-16 place-items-center rounded-[var(--radius-full)]" style={{ backgroundColor: `${c.color}22` }}>
                <Gem size={28} style={{ color: c.color }} aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: c.color }}>{t("nightreign.relicColour")}</p>
            <h2 className="text-2xl font-semibold leading-tight text-white">{c.scene}</h2>
            <p className="mt-1 text-[12px] text-zinc-500">{t("nightreign.possibleEffectsCategories", { effects: c.effects.length, categories: presentCats.length })}</p>
          </div>
        </div>
        <p className="relative mt-3 max-w-2xl text-pretty text-[13px] leading-relaxed text-zinc-400">
          {t("nightreign.colorViewDescription", { scene: c.scene.toLowerCase() })}
        </p>
      </div>

      {/* Toolbar: category dropdown + search (shared chrome, consistent with the rest of the app) */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
        <Dropdown
          icon={SlidersHorizontal}
          /* "Category" caption is dropped on phones so the picker + search share one row. */
          caption={isMobile ? undefined : t("nightreign.category")}
          value={activeCat ?? "__all"}
          options={catOptions}
          onChange={(v) => setActiveCat(v === "__all" ? null : v)}
          className="shrink-0 bg-surface/80"
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-1.5 focus-within:border-accent/60 sm:ml-auto sm:flex-none">
          <Search size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nightreign.filterEffects")}
            className="w-full min-w-0 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 sm:w-40"
          />
        </div>
      </div>

      {/* Grouped effect sections */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-zinc-500">{t("nightreign.noEffectMatches", { query })}</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              const m = CAT_META[g.cat] ?? CAT_META.utility;
              return (
                <section key={g.cat}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)]" style={{ backgroundColor: `${m.hue}1a` }}>
                      <m.Icon size={13} style={{ color: m.hue }} aria-hidden="true" />
                    </span>
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{catLabel(t, g.cat)}</h3>
                    <span className="text-[11px] tabular-nums text-subtle">{g.effects.length}</span>
                    <span className="ml-1 h-px flex-1" style={{ background: `linear-gradient(to right, ${m.hue}33, transparent)` }} aria-hidden="true" />
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.effects.map((e) => (
                      <EffectChip key={e.name} e={e} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <p className="mt-6 text-center text-[11px] text-subtle">{t("nightreign.effectsShown", { n: shownCount })}</p>
      </div>
    </div>
  );
};

/** A single deep relic card: vessel, name, colour, fixed effects. */
const DeepCard = ({ r }: { r: DeepRelic }) => {
  const { t } = useTranslation();
  const c = colorById(r.color);
  const hex = c?.color ?? "#a1a1aa";
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white/[0.02]">
      <div className="relative flex items-center gap-3 px-3.5 pb-3 pt-3.5">
        <div className="pointer-events-none absolute -left-6 -top-10 h-28 w-28 opacity-40 blur-2xl" style={{ background: `radial-gradient(circle, ${hex}66, transparent 70%)` }} aria-hidden="true" />
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-[var(--radius-full)] blur-md" style={{ background: `radial-gradient(circle, ${hex}99, transparent 70%)` }} aria-hidden="true" />
          {vesselSrc(r.icon) ? (
            <img src={vesselSrc(r.icon)!} alt="" draggable={false} className="relative h-12 w-12 object-contain" />
          ) : (
            <span className="relative grid h-12 w-12 place-items-center rounded-[var(--radius-full)]" style={{ backgroundColor: `${hex}22` }}>
              <Sparkles size={18} style={{ color: hex }} aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="relative min-w-0">
          <h4 className="text-pretty text-[15px] font-semibold leading-tight text-white">{r.name}</h4>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex, boxShadow: `0 0 6px ${hex}` }} aria-hidden="true" />
            {c?.scene ?? t("nightreign.relicFallback")}
          </span>
        </div>
      </div>
      <ul className="space-y-1.5 px-3.5 pb-3.5">
        {r.effects.map((e, i) => {
          const meta = CAT_META[e.cat] ?? CAT_META.utility;
          return (
            <li key={i} className="flex items-center gap-2.5 text-pretty text-[12.5px] leading-snug text-zinc-200">
              <EffectIcon e={e} hue={meta.hue} size={26} />
              <span className="min-w-0">{heroTag(e.name).text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Deep relics, grouped by the Nightlord that drops them (portrait + prominent weakness header). */
const DeepRelicsView = () => {
  const { t } = useTranslation();
  const dataVersion = useDataVersion((s) => s.version);
  const groups = useMemo(() => {
    const order: string[] = [];
    const byNl = new Map<string, DeepRelic[]>();
    for (const r of nrRelics.deepRelics) {
      const key = r.nightlord ?? "Unknown";
      if (!byNl.has(key)) { byNl.set(key, []); order.push(key); }
      byNl.get(key)!.push(r);
    }
    return order.map((nl) => ({ nl, relics: byNl.get(nl)! }));
  }, [dataVersion]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative overflow-hidden border-b border-border px-4 pb-4 pt-6 sm:px-6">
        <div className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 opacity-40 blur-2xl" style={{ background: "radial-gradient(circle, #c084fc66, transparent 70%)" }} aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-accent-soft">
            <Sparkles size={18} className="text-accent" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{t("nightreign.deepRelics")}</p>
            <h2 className="text-xl font-semibold leading-tight text-white">{t("nightreign.signatureNightlordRelics")}</h2>
          </div>
        </div>
        <p className="relative mt-3 max-w-2xl text-pretty text-[13px] leading-relaxed text-zinc-400">
          {t("nightreign.deepRelicsDescription")}
        </p>
      </div>

      <div className="space-y-7 p-4 sm:p-6">
        {groups.map(({ nl, relics }) => {
          const meta = nrNightlordMeta.get(nl);
          const portrait = nightlordSrc(nl);
          return (
            <section key={nl}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {portrait ? (
                  <img src={portrait} alt="" draggable={false} className="h-10 w-10 rounded-[var(--radius-full)] object-cover ring-1 ring-white/15" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-full)] bg-white/5"><Gem size={16} className="text-zinc-500" aria-hidden="true" /></span>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t("nightreign.defeatTheNightlord")}</p>
                  <h3 className="text-[16px] font-semibold leading-tight text-white">{nl}</h3>
                </div>
                {meta?.weakness && meta.weakness.length > 0 && (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-white/[0.03] py-1 pl-2.5 pr-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-200">
                      <ShieldAlert size={13} className="text-zinc-300" aria-hidden="true" />
                      {t("nightreign.weakTo")}
                    </span>
                    {meta.weakness.map((w) => {
                      const hue = ELEMENT_COLOR[w] ?? "#a1a1aa";
                      return (
                        <span key={w} className="rounded-[var(--radius-full)] px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ backgroundColor: `${hue}26`, color: hue, boxShadow: `inset 0 0 0 1px ${hue}55` }}>
                          {t(`combatType.${w}`, { defaultValue: w })}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {relics.map((r) => (
                  <DeepCard key={r.id} r={r} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

type Sel = { kind: "color"; id: number } | { kind: "deep" };

/**
 * The Relic compendium — the four relic colours' rollable effect pools (grouped by category, with
 * real in-game buff icons) plus the signature "Night of …" deep relics tied to each Nightlord.
 * Mirrors the Nightfarer/Archive chrome (masthead, rail, detail).
 */
const RelicBrowser = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  // useTranslation already re-renders on the language flip; read colours / deep relics
  // through the live nrRelics so the rail + counts pick up the localized names.
  const { colors, deepRelics } = nrRelics;
  const [sel, setSel] = useState<Sel>({ kind: "color", id: colors[0]?.id ?? 0 });

  // Phone layout is single-pane master/detail: the colour rail and the effect view never
  // share the row. Picking a colour slides to the detail; Back returns to the rail.
  // `isMobile` is always false in Overwolf (≥1300px), so the two-column layout is untouched.
  const isMobile = useIsMobile();
  const [mobileDetail, setMobileDetail] = useState(false);
  const pick = (next: Sel) => {
    setSel(next);
    setMobileDetail(true); // slide to the detail pane on phones (no-op on desktop)
  };

  return (
    <div data-game="nightreign" className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Gem size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">{t("nightreign.relics")}</h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">{t("nightreign.relicsSubtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("nightreign.closeRelics")}
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 px-3 pb-3 pt-[18px]">
        {(!isMobile || !mobileDetail) && (
        <nav className={cn(
          "shrink-0 overflow-y-auto border-border p-2",
          isMobile ? "w-full" : "w-56 border-r",
        )}>
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("nightreign.colours")}</p>
          {colors.map((c) => {
            const active = sel.kind === "color" && sel.id === c.id;
            const src = vesselSrc(c.vessel);
            return (
              <button
                key={c.id}
                onClick={() => pick({ kind: "color", id: c.id })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors cursor-pointer",
                  active ? "bg-accent-soft" : "hover:bg-white/5",
                )}
              >
                <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                <span className="relative grid h-9 w-9 shrink-0 place-items-center">
                  <span className="absolute inset-0 rounded-[var(--radius-full)] blur-[6px]" style={{ background: `radial-gradient(circle, ${c.color}88, transparent 70%)` }} aria-hidden="true" />
                  {src ? (
                    <img src={src} alt="" draggable={false} className="relative h-8 w-8 object-contain" />
                  ) : (
                    <span className="relative h-3.5 w-3.5 rounded-full" style={{ backgroundColor: c.color }} />
                  )}
                </span>
                <span className={cn("flex-1 text-[13px]", active ? "text-white" : "text-zinc-300")}>{c.scene}</span>
                <span className={cn("text-[11px] tabular-nums", active ? "text-zinc-300" : "text-subtle")}>{c.effects.length}</span>
              </button>
            );
          })}
          <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("nightreign.special")}</p>
          <button
            onClick={() => pick({ kind: "deep" })}
            aria-current={sel.kind === "deep" ? "true" : undefined}
            className={cn(
              "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors cursor-pointer",
              sel.kind === "deep" ? "bg-accent-soft" : "hover:bg-white/5",
            )}
          >
            <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity", sel.kind === "deep" ? "opacity-100" : "opacity-0")} />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-white/5">
              <Sparkles size={16} className={sel.kind === "deep" ? "text-accent" : "text-zinc-500"} aria-hidden="true" />
            </span>
            <span className={cn("flex-1 text-[13px]", sel.kind === "deep" ? "text-white" : "text-zinc-300")}>{t("nightreign.deepRelics")}</span>
            <span className={cn("text-[11px] tabular-nums", sel.kind === "deep" ? "text-zinc-300" : "text-subtle")}>{deepRelics.length}</span>
          </button>
        </nav>
        )}

        {(!isMobile || mobileDetail) && (
        <div className="flex min-w-0 flex-1 flex-col">
          {isMobile && (
            <button
              onClick={() => setMobileDetail(false)}
              className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white cursor-pointer"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {t("nightreign.colours")}
            </button>
          )}
          <div className="min-h-0 flex-1">
            {sel.kind === "deep" ? <DeepRelicsView /> : <ColorView key={sel.id} c={colorById(sel.id) ?? colors[0]} />}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default RelicBrowser;
