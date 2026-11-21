import { useTranslation } from "react-i18next";
import { type ErItem } from "../../data/er-items-data";

/** Stat abbreviations whose full names (attributes + damage types) are localized via
 * t("codex.stat.<key>"). Anything not listed (Fire, Holy, Strike, Weight, Upgrade, FP…) is
 * already a full word and falls through unchanged. */
const STAT_LABEL_KEYS = ["Str", "Dex", "Int", "Fai", "Arc", "Phy", "Mag", "Ltn"];

/** Small labeled stat grid. Entry keys stay as stable English identifiers (React key +
 * data lookup); the displayed label is localized — attribute/damage abbreviations via
 * t("codex.stat.<key>"), the rest via t("codex.label.<key>") with the raw key as fallback. */
const Grid = ({ entries }: { entries: [string, string | number][] }) => {
  const { t } = useTranslation();
  const labelFor = (k: string) =>
    STAT_LABEL_KEYS.includes(k) ? t(`codex.stat.${k}`) : t(`term.${k}`, { defaultValue: k });
  return (
    <dl className="grid grid-cols-2 gap-1.5">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-white/[0.03] px-2.5 py-1.5"
        >
          <dt className="text-[12px] text-muted">{labelFor(k)}</dt>
          <dd className="text-[12px] font-semibold tabular-nums text-zinc-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-3">
    <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
      <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
      {title}
    </h4>
    {children}
  </div>
);

const rec = (o: unknown): [string, string | number][] =>
  Object.entries((o ?? {}) as Record<string, string | number>);

/** Inventory stack cap, when the item actually has one worth showing (>1).
 * Rendered as a badge beside runes/weight, not in the stat grid. */
export const erMaxHeld = (item: ErItem): number | null => {
  const stack = (item.stats as Record<string, unknown>)?.stack;
  return typeof stack === "number" && stack > 1 ? stack : null;
};

/** Type-aware stat rendering for an ER item. */
const ErItemStats = ({ item }: { item: ErItem }) => {
  const { t } = useTranslation();
  const s = item.stats as Record<string, unknown>;

  if (item.category === "weapon") {
    return (
      <>
        {s.attack && Object.keys(s.attack).length ? (
          <Section title={t("codex.section.attackPower")}><Grid entries={rec(s.attack)} /></Section>
        ) : null}
        {s.scaling && Object.keys(s.scaling).length ? (
          <Section title={t("codex.section.scaling")}><Grid entries={rec(s.scaling)} /></Section>
        ) : null}
        {s.requirements && Object.keys(s.requirements).length ? (
          <Section title={t("codex.section.requirements")}><Grid entries={rec(s.requirements)} /></Section>
        ) : null}
        {s.upgrade ? <Grid entries={[["Upgrade", String(s.upgrade)]]} /> : null}
      </>
    );
  }

  if (item.category === "armor") {
    return (
      <>
        {s.negation ? (
          <Section title={t("codex.section.damageNegation")}><Grid entries={rec(s.negation)} /></Section>
        ) : null}
        {s.resistance ? (
          <Section title={t("codex.section.resistance")}><Grid entries={rec(s.resistance)} /></Section>
        ) : null}
        <Grid entries={[["Poise", Number(s.poise ?? 0)]]} />
      </>
    );
  }

  if (item.category === "sorcery" || item.category === "incantation") {
    return (
      <>
        <Grid
          entries={[
            ["FP", Number(s.fp_cost ?? 0)],
            ["Stamina", Number(s.stamina ?? 0)],
            ["Slots", Number(s.slots ?? 0)],
          ]}
        />
        {s.requirements && Object.keys(s.requirements).length ? (
          <Section title={t("codex.section.requirements")}><Grid entries={rec(s.requirements)} /></Section>
        ) : null}
      </>
    );
  }

  // Everything else (goods, materials, keys…) has no stat table of its own: weight and
  // the stack cap are single numbers, and both ride the badge row at the top of the page
  // — repeating them down here was the same fact printed twice.
  return null;
};

export default ErItemStats;
