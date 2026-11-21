import { useState } from "react";
import { ChevronLeft, Clock, Repeat, ScrollText, Swords, Target, Users, X, Zap } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  nrNightfarers,
  nrRemembrances,
  type HeroRemembrance,
  type Nightfarer,
  type NightfarerAbility,
  type RemembranceNode,
} from "../../data/nightreign-data";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

const icon = (id: number) => `/icons/nightreign/menu/${id}.png`;
const illust = (id: number) => `/icons/nightreign/scenario/${id}.webp`;

// Game ability copy is hard-wrapped with newlines to fit the narrow in-game box; collapse them so
// the text flows and wraps to our card width instead of breaking mid-sentence ("depends\non …").
const flow = (t: string) => t.replace(/\s*\n\s*/g, " ").trim();

// Classic Elden Ring stat hues — so a build reads the same way at a glance.
const STAT_ORDER = ["Vigor", "Mind", "Endurance", "Strength", "Dexterity", "Intelligence", "Faith", "Arcane"] as const;
const STAT_COLOR: Record<string, string> = {
  Vigor: "#f87171", Mind: "#60a5fa", Endurance: "#4ade80", Strength: "#fb923c",
  Dexterity: "#a3e635", Intelligence: "#22d3ee", Faith: "#fde68a", Arcane: "#c084fc",
};
// The 4 real HeroStatusParam level anchors; the game interpolates levels in between, so we do too.
const STAT_ANCHORS = [1, 2, 12, 15];

/** "Preference: Greatswords" lives at the end of the lore blurb — pull it out as a tag. */
const splitLore = (lore: string | null) => {
  if (!lore) return { body: null as string | null, preference: null as string | null };
  const m = lore.match(/Preference:\s*(.+)\s*$/);
  return { body: (m ? lore.slice(0, m.index) : lore).trim(), preference: m ? m[1].trim() : null };
};

const AbilityCard = ({
  kind,
  ability,
  accent,
  badges,
}: {
  kind: string;
  ability: NightfarerAbility;
  accent: string;
  badges?: { icon: typeof Clock; label: string }[];
}) => (
  <div className="rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
    <div className="flex items-start gap-3">
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)]"
        style={{ backgroundColor: `${accent}1a`, boxShadow: `inset 0 0 0 1px ${accent}33` }}
      >
        <img src={icon(ability.iconId)} alt="" draggable={false} className="h-9 w-9 object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
          {kind}
        </p>
        <h4 className="text-[15px] font-semibold leading-tight text-white">{ability.name ?? "—"}</h4>
        {badges && badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200"
              >
                <b.icon size={11} className="text-zinc-400" aria-hidden="true" />
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    {ability.summary && (
      <p className="mt-2.5 text-[13px] font-medium leading-relaxed text-zinc-200">{flow(ability.summary)}</p>
    )}
    {ability.description && (
      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{flow(ability.description)}</p>
    )}
  </div>
);

const OFFENSE_STATS = ["Strength", "Dexterity", "Intelligence", "Faith"] as const;

const StatName = ({ s }: { s: string }) => {
  const { t } = useTranslation();
  return (
    <span className="font-semibold" style={{ color: STAT_COLOR[s] ?? "#e4e4e7" }}>
      {t(`stat.${s}`, { defaultValue: s })}
    </span>
  );
};

/** "A, B and C", each stat name in its colour (mirrors the boss combat-tips TypeList). */
const StatList = ({ stats }: { stats: string[] }) => (
  <>
    {stats.map((s, i) => (
      <span key={s}>
        <StatName s={s} />
        {i < stats.length - 2 ? ", " : i === stats.length - 2 ? " and " : ""}
      </span>
    ))}
  </>
);

/**
 * "Playstyle" — the Nightfarer parallel to the boss Combat Tips page. Every line is DERIVED from
 * the hero's real numbers (Lv-15 stat profile + weapon preference + skill cadence) with fixed
 * rules, never hand-written wiki tips; coloured sentence rows mirror features/detail/combat-tips.
 */
const PlaystyleCard = ({ n, preference }: { n: Nightfarer; preference: string | null }) => {
  const { t } = useTranslation();
  const v = n.maxStats; // Lv-15 ceiling — where the hero's identity reads
  // Top leveling attributes by Lv-15 value (Arcane excluded — it's fixed, not a growth stat).
  const topStats = STAT_ORDER.filter((s) => s !== "Arcane")
    .sort((a, b) => (v[b] ?? 0) - (v[a] ?? 0))
    .slice(0, 3);
  // Dominant offensive stat → archetype.
  const [top, second] = [...OFFENSE_STATS].sort((a, b) => (v[b] ?? 0) - (v[a] ?? 0));
  const isCaster = (s: string) => s === "Intelligence" || s === "Faith";
  const hybrid = isCaster(top) && isCaster(second) && (v[second] ?? 0) >= (v[top] ?? 0) * 0.85;
  const archetypeKey = hybrid
    ? "hybridCaster"
    : top === "Intelligence" ? "sorceryCaster"
    : top === "Faith" ? "faithCaster"
    : top === "Strength" ? "strengthBruiser"
    : "dexteritySkirmisher";
  const archetype = t(`nightreign.archetype.${archetypeKey}`);
  const vig = v.Vigor ?? 0;
  const durBucket = vig >= 45 ? "durable" : vig <= 33 ? "fragile" : "balanced";
  const sk = n.skill;

  // Second row: the offence clause, then a preference/spell suffix appended to it.
  const offenceClause = hybrid ? (
    <Trans
      i18nKey="nightreign.bestDamageHybrid"
      components={{ int: <StatName s="Intelligence" />, fth: <StatName s="Faith" /> }}
    />
  ) : top === "Intelligence" ? (
    <Trans i18nKey="nightreign.bestDamageSorcery" components={{ int: <StatName s="Intelligence" /> }} />
  ) : top === "Faith" ? (
    <Trans i18nKey="nightreign.bestDamageIncantation" components={{ fth: <StatName s="Faith" /> }} />
  ) : (
    <Trans i18nKey="nightreign.bestScaling" components={{ stat: <StatName s={top} /> }} />
  );
  const offenceSuffix =
    preference && preference !== "None"
      ? t("nightreign.favoursPreference", { preference })
      : isCaster(top) || hybrid
      ? t("nightreign.noSignatureWeapon")
      : ".";

  const rows: React.ReactNode[] = [
    <Trans
      i18nKey={`nightreign.growsMost.${durBucket}`}
      values={{ archetype }}
      components={{ list: <StatList stats={topStats} /> }}
    />,
    <>
      {offenceClause}
      {offenceSuffix}
    </>,
    vig >= 45 ? (
      <Trans i18nKey="nightreign.vigorHigh" values={{ vig }} components={{ stat: <StatName s="Vigor" /> }} />
    ) : vig <= 33 ? (
      <Trans i18nKey="nightreign.vigorLow" values={{ vig }} components={{ stat: <StatName s="Vigor" /> }} />
    ) : (
      <Trans i18nKey="nightreign.vigorModerate" values={{ vig }} components={{ stat: <StatName s="Vigor" /> }} />
    ),
  ];
  if (sk.name) {
    rows.push(
      sk.cooldown ? (
        <Trans
          i18nKey="nightreign.skillCadenceCooldown"
          values={{ name: sk.name, cooldown: sk.cooldown }}
          components={{ b: <span className="font-medium text-zinc-100" /> }}
        />
      ) : (
        <Trans
          i18nKey="nightreign.skillCadenceNoCooldown"
          values={{ name: sk.name }}
          components={{ b: <span className="font-medium text-zinc-100" /> }}
        />
      ),
    );
  }

  return (
    <div className="lg:col-span-2">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t("nightreign.playstyle")}</h3>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <p
            key={i}
            className="rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300"
          >
            {r}
          </p>
        ))}
      </div>
    </div>
  );
};

/** Journal entry — a chapter card: title, the game's own journal prose, and (on the
 *  final chapter) the epilogue illustration. Bodies keep their real \n\n paragraphs. */
const JournalCard = ({ node }: { node: Extract<RemembranceNode, { t: "j" }> }) => (
  <article className="rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-4 sm:p-5">
    <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-accent">
      {node.title}
    </h3>
    {/* pre-wrap (not pre-line): journal prose intentionally blanks names with runs of
        spaces ("and to         , the horses…") — collapsing them would read as a typo. */}
    <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-zinc-200">
      {node.body}
    </p>
    {node.image !== undefined && (
      <img
        src={illust(node.image)}
        alt=""
        loading="lazy"
        draggable={false}
        className="mt-4 w-full max-w-xl rounded-[var(--radius-md)] border border-border object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    )}
  </article>
);

/** Objective step — a compact quest-log row between journal chapters. */
const ObjectiveRow = ({ text }: { text: string }) => (
  <div className="flex items-start gap-2.5 px-1.5">
    <Target size={13} className="mt-[3px] shrink-0 text-accent/80" aria-hidden="true" />
    <p className="text-[12.5px] leading-relaxed text-zinc-400">{text}</p>
  </div>
);

// Module scope, not persisted: once the user opts into story spoilers the choice holds for
// all eight heroes and overlay reopens; a fresh app launch asks again.
let spoilersRevealed = false;

/**
 * Remembrance — the hero's personal questline, told through the game's own journal
 * entries with the quest objectives between them, in play order (extracted from
 * PersonalScenarioParam + PersonalScenario FMGs; nothing is hand-written). Sits behind
 * a one-time spoiler gate because the roster page is otherwise spoiler-free.
 */
const RemembranceSection = ({ r }: { r: HeroRemembrance }) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(spoilersRevealed);
  if (!revealed) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 py-16 text-center animate-fade-in">
        <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-full)] border border-accent/30 bg-accent-soft">
          <ScrollText size={20} className="text-accent" aria-hidden="true" />
        </div>
        <p className="text-[14px] font-semibold text-white">{t("nightreign.spoilerNote")}</p>
        <p className="max-w-md text-[12.5px] leading-relaxed text-zinc-400">
          {t("nightreign.remembranceSubtitle")}
        </p>
        <button
          onClick={() => {
            spoilersRevealed = true;
            setRevealed(true);
          }}
          className="mt-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft px-4 py-2 text-[13px] font-medium text-white transition-colors hover:border-accent/70 cursor-pointer"
        >
          {t("nightreign.revealChapters")}
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5 sm:px-6 animate-fade-in">
      {r.nodes.map((node, i) =>
        node.t === "j" ? <JournalCard key={i} node={node} /> : <ObjectiveRow key={i} text={node.text} />,
      )}
    </div>
  );
};

type DetailTab = "overview" | "remembrance";

const NightfarerDetail = ({ n, tab, onTab }: { n: Nightfarer; tab: DetailTab; onTab: (t: DetailTab) => void }) => {
  const { t } = useTranslation();
  const { body, preference } = splitLore(n.lore);
  // HeroStatusParam stores 4 real level anchors (1/2/12/15); the game interpolates the levels in
  // between, so we do the same — exact on an anchor, piecewise-linear (rounded) elsewhere. The
  // slider reads any level 1–15; bars scale to the Lv-15 ceiling so the fixed Arcane never skews.
  const [level, setLevel] = useState(15);
  const heroMax = Math.max(...Object.values(n.statLevels["15"] ?? n.maxStats), 1);
  // The hero's questline lives on a second tab of the same page, so build/story never
  // fight for space. Falls back to Overview if a hero ever ships without one.
  const remembrance = nrRemembrances.find((r) => r.heroId === n.id);
  const shown: DetailTab = remembrance ? tab : "overview";
  const chapterCount = remembrance ? remembrance.nodes.filter((node) => node.t === "j").length : 0;
  const isAnchor = STAT_ANCHORS.includes(level);
  const statAt = (s: string) => {
    let lo = STAT_ANCHORS[0];
    let hi = STAT_ANCHORS[STAT_ANCHORS.length - 1];
    for (let i = 0; i < STAT_ANCHORS.length - 1; i++) {
      if (level >= STAT_ANCHORS[i] && level <= STAT_ANCHORS[i + 1]) {
        [lo, hi] = [STAT_ANCHORS[i], STAT_ANCHORS[i + 1]];
        break;
      }
    }
    const a = n.statLevels[String(lo)]?.[s] ?? 0;
    const b = n.statLevels[String(hi)]?.[s] ?? 0;
    return hi === lo ? a : Math.round(a + (b - a) * ((level - lo) / (hi - lo)));
  };
  return (
    <div className="h-full overflow-y-auto">
      {/* Hero banner */}
      <div className="relative overflow-hidden border-b border-border px-4 pb-5 pt-6 sm:px-6">
        <div
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 opacity-50 blur-2xl"
          style={{ background: "radial-gradient(circle, var(--color-accent, #e8b923)55, transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-[var(--radius-full)] blur-md"
              style={{ background: "radial-gradient(circle, var(--color-accent, #e8b923)99, transparent 70%)" }}
              aria-hidden="true"
            />
            <img
              src={icon(n.portraitId)}
              alt=""
              draggable={false}
              className="relative h-20 w-20 rounded-[var(--radius-full)] object-cover ring-1 ring-white/15 sm:h-24 sm:w-24"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{t("nightreign.nightfarer")}</p>
            <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl">{n.name}</h2>
            {preference && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300">
                <Swords size={12} className="text-zinc-400" aria-hidden="true" />
                {t("nightreign.prefersWeapon", { preference })}
              </span>
            )}
          </div>
        </div>
        {body && <p className="relative mt-4 max-w-2xl whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{body}</p>}
      </div>

      {/* Sticky so the tabs stay reachable while scrolling a long journal. Solid
          bg-background (no backdrop-blur) so performance mode has nothing to kill. */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-background px-2 sm:px-4" role="tablist">
        {(
          [
            { key: "overview" as const, tKey: "nightreign.tabOverview", icon: Users },
            { key: "remembrance" as const, tKey: "nav.remembrance", icon: ScrollText },
          ]
        ).map(({ key, tKey, icon: TabIcon }) => {
          if (key === "remembrance" && !remembrance) return null;
          const active = shown === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => onTab(key)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors cursor-pointer",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <TabIcon size={14} className={active ? "text-accent" : "text-zinc-500"} aria-hidden="true" />
              {t(tKey)}
              {key === "remembrance" && (
                <span
                  title={t("nightreign.remembranceChapters", { count: chapterCount })}
                  className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-px text-[10px] font-semibold tabular-nums text-zinc-300"
                >
                  {chapterCount}
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-accent transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          );
        })}
      </div>

      {shown === "remembrance" && remembrance ? (
        <RemembranceSection r={remembrance} />
      ) : (
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2 animate-fade-in">
        {/* Attributes — one level at a time via the Lv 1 / Lv 15 toggle. At Lv 1 every stat is
            small and the fixed Arcane looks dominant; Lv 15 is where each hero's identity reads. */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t("nightreign.attributes")}</h3>
            <div className="flex items-center gap-2.5">
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                aria-label={t("nightreign.characterLevel")}
                className="w-28 cursor-pointer"
                style={{ accentColor: "var(--color-accent, #e8b923)" }}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{t("nightreign.lv")}</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={level}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setLevel(Math.min(15, Math.max(1, Math.round(v))));
                  }}
                  aria-label={t("nightreign.characterLevel")}
                  className="w-12 rounded-[var(--radius-md)] border border-border bg-white/[0.06] px-1.5 py-1 text-center text-[12px] font-semibold tabular-nums text-white outline-none transition-colors focus:border-accent/60 [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:[-webkit-appearance:none] [&::-webkit-outer-spin-button]:[-webkit-appearance:none]"
                />
                <span
                  className="w-2 text-center text-[11px] text-subtle"
                  title={isAnchor ? undefined : t("nightreign.interpolatedTitle")}
                >
                  {isAnchor ? "" : "≈"}
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {STAT_ORDER.map((s) => {
              const val = statAt(s);
              const fixed = (n.statLevels["1"]?.[s] ?? 0) === (n.statLevels["15"]?.[s] ?? 0);
              const c = STAT_COLOR[s];
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12px] text-zinc-400">{t(`stat.${s}`, { defaultValue: s })}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-full)] bg-white/8">
                    <div
                      className="h-full rounded-[var(--radius-full)] transition-[width] duration-300"
                      style={{ width: `${(val / heroMax) * 100}%`, backgroundColor: c }}
                    />
                  </div>
                  <span className="flex w-14 shrink-0 items-baseline justify-end gap-1 tabular-nums">
                    <span className="text-[13px] font-semibold text-white">{val}</span>
                    {fixed && (
                      <span
                        className="text-[9px] font-medium uppercase tracking-[0.1em] text-subtle"
                        title={t("nightreign.fixedTitle")}
                      >
                        {t("nightreign.fixed")}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <PlaystyleCard n={n} preference={preference} />

        {/* Abilities */}
        <AbilityCard
          kind={t("nightreign.skill")}
          ability={n.skill}
          accent="#7dd3fc"
          badges={[
            ...(n.skill.cooldown ? [{ icon: Clock, label: t("nightreign.cooldownBadge", { cooldown: n.skill.cooldown }) }] : []),
            ...(n.skill.uses
              ? [{ icon: Repeat, label: t(n.skill.uses > 1 ? "nightreign.usesBadge_many" : "nightreign.usesBadge_one", { count: n.skill.uses }) }]
              : []),
          ]}
        />
        <AbilityCard kind={t("nightreign.ultimateArt")} ability={n.ultimateArt} accent="#fbbf24" badges={[{ icon: Zap, label: t("nightreign.chargesInCombat") }]} />
        <AbilityCard kind={t("nightreign.passive")} ability={n.passive} accent="#c084fc" />
      </div>
      )}
    </div>
  );
};

/**
 * The Nightfarer roster — a full-screen browser over the 8 playable Heroes, mirroring the
 * ER Grand Archive's chrome (masthead, left rail, detail page). The map only ever shows the
 * world you fight in, never who you play; this is where that lives.
 */
const NightfarerOverlay = ({ onClose, initialName }: { onClose: () => void; initialName?: string | null }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(
    () => nrNightfarers.find((n) => n.name === initialName)?.id ?? nrNightfarers[0]?.id,
  );
  const current = nrNightfarers.find((n) => n.id === selectedId) ?? nrNightfarers[0];
  // Survives hero switches on purpose: reading one hero's Remembrance then picking the
  // next in the rail lands on THAT hero's story — the old standalone page's browse flow.
  const [tab, setTab] = useState<DetailTab>("overview");

  // Phone layout is single-pane master/detail: the roster rail and the hero page never share the
  // row. Picking a hero slides to the detail; Back returns to the roster. A search jump
  // (`initialName`) opens straight on the hero. `isMobile` is always false in Overwolf (≥1300px),
  // so the desktop/Overwolf two-column layout is untouched.
  const isMobile = useIsMobile();
  const [mobileDetail, setMobileDetail] = useState(!!initialName);
  const pick = (id: typeof selectedId) => {
    setSelectedId(id);
    setMobileDetail(true); // slide to the detail pane on phones (no-op on desktop)
  };

  return (
    <div data-game="nightreign" className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Users size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">{t("nightreign.nightfarers")}</h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">{t("nightreign.nightfarersSubtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("nightreign.closeRoster")}
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
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("nightreign.roster")}</p>
          {nrNightfarers.map((n) => {
            const active = n.id === current.id;
            return (
              <button
                key={n.id}
                onClick={() => pick(n.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors cursor-pointer",
                  active ? "bg-accent-soft" : "hover:bg-white/5",
                )}
              >
                <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                <img src={icon(n.smallPortraitId)} alt="" draggable={false} className="h-9 w-9 rounded-[var(--radius-full)] object-cover" />
                <div className="min-w-0">
                  <p className={cn("truncate text-[13px] font-medium", active ? "text-white" : "text-zinc-300")}>{n.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{n.skill.name}</p>
                </div>
              </button>
            );
          })}
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
              {t("nightreign.roster")}
            </button>
          )}
          <div className="min-h-0 flex-1">
            <NightfarerDetail n={current} tab={tab} onTab={setTab} />
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default NightfarerOverlay;
