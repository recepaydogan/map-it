import { useState } from "react";
import { ChevronLeft, Gauge, ScrollText, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  type Combat,
  type StatusTier,
  colorFor,
  dmgPct,
  isResist,
  isWeak,
} from "../../data/combat";
import { erStatusExplanation } from "../../data/er-guide-data";
import { localizeErMapText } from "../../data/er-map-text";
import type { Marker } from "../../data/types";
import { cn } from "../../lib/cn";
import BuildAdvisor from "./build-advisor";
import { hasBuildAdvisor } from "./has-build-advisor";

/** A comma-separated run of type names, each in its own colour ("…, … and …"). */
const TypeList = ({ types }: { types: string[] }) => {
  const { t } = useTranslation();
  return (
    <>
      {types.map((type, i) => (
        <span key={type}>
          <span className="font-semibold" style={{ color: colorFor(type) }}>
            {t(`combatType.${type}`, { defaultValue: type })}
          </span>
          {i < types.length - 2 ? ", " : i === types.length - 2 ? ` ${t("common.and")} ` : ""}
        </span>
      ))}
    </>
  );
};

/** One sentence covering every type that shares a tier — names coloured inline. */
const statusSentence = (tier: StatusTier, types: string[]) => {
  const list = <TypeList types={types} />;
  const many = types.length > 1;
  switch (tier) {
    case "effective":
      return many ? (
        <Trans i18nKey="detail.statusEffective_many" components={{ list }} />
      ) : (
        <Trans i18nKey="detail.statusEffective_one" components={{ list }} />
      );
    case "moderate":
      return many ? (
        <Trans i18nKey="detail.statusModerate_many" components={{ list }} />
      ) : (
        <Trans i18nKey="detail.statusModerate_one" components={{ list }} />
      );
    case "resistant":
      return many ? (
        <Trans i18nKey="detail.statusResistant_many" components={{ list }} />
      ) : (
        <Trans i18nKey="detail.statusResistant_one" components={{ list }} />
      );
    case "immune":
      return many ? (
        <Trans i18nKey="detail.statusImmune_many" components={{ list }} />
      ) : (
        <Trans i18nKey="detail.statusImmune_one" components={{ list }} />
      );
  }
};

/** One sentence covering every damage type that shares a multiplier. */
const damageSentence = (mult: number, types: string[]) => {
  const list = <TypeList types={types} />;
  const p = dmgPct(mult);
  if (isWeak(mult))
    return <Trans i18nKey="detail.damageWeak" values={{ pct: p }} components={{ list }} />;
  if (isResist(mult))
    return <Trans i18nKey="detail.damageResist" values={{ pct: p }} components={{ list }} />;
  return <Trans i18nKey="detail.damageNeutral" components={{ list }} />;
};

const Row = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
    {children}
  </p>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    <div className="flex flex-col gap-1.5">{children}</div>
  </div>
);

const MetaBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
    <span className="text-zinc-500">{label} </span>
    <span className="tabular-nums">{value}</span>
  </span>
);

/**
 * Health — the number on the boss's health bar, plus where it comes from.
 *
 * NpcParam.hp is only a BASE value; the game multiplies it by the region-scaling SpEffects
 * the boss's own row carries (Stormveil ×1.66 … Enir-Ilim ×14.09, and ×2 again for the "boss
 * version" of a common enemy). Showing the breakdown makes the number checkable instead of
 * magic — and the co-op line is the same table with MultiPlayCorrectionParam's phantom
 * multipliers applied.
 */

/**
 * What each ailment on this boss actually does — the game's own knowledge-card text
 * (LoadingText 70-77), folded away so the panel stays scannable. Only the statuses that
 * appear on this boss are listed.
 */
const StatusPrimer = ({ types }: { types: string[] }) => {
  const { t } = useTranslation();
  // Card bodies are the game's own LoadingText cards — baked English; the ER-map
  // flat dictionary carries their official translations.
  const cards = types
    .map((type) => ({ type, body: erStatusExplanation(type) }))
    .filter((c): c is { type: string; body: string } => !!c.body)
    .map((c) => ({ ...c, body: localizeErMapText(c.body) }));
  if (!cards.length) return null;
  return (
    <details className="group rounded-[var(--radius-md)] border border-border bg-white/[0.02]">
      <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        {t("detail.statusPrimer")}
        <span className="float-right text-subtle transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2.5">
        {cards.map((c) => (
          <p key={c.type} className="text-[12px] leading-relaxed text-zinc-400">
            <span className="font-semibold" style={{ color: colorFor(c.type) }}>
              {t(`combatType.${c.type}`, { defaultValue: c.type })}
            </span>{" "}
            — {c.body}
          </p>
        ))}
      </div>
    </details>
  );
};

/** Collapse a list into [{ key, types }] groups, preserving first-seen order. */
function groupBy<T>(items: T[], keyOf: (x: T) => number | string, typeOf: (x: T) => string) {
  const out: { key: number | string; types: string[] }[] = [];
  const idx = new Map<number | string, number>();
  for (const it of items) {
    const k = keyOf(it);
    if (!idx.has(k)) {
      idx.set(k, out.length);
      out.push({ key: k, types: [] });
    }
    out[idx.get(k)!].types.push(typeOf(it));
  }
  return out;
}

/**
 * Full-panel "Combat Tips" page for a boss: every damage channel and status
 * effect, with types that share a value collapsed into a single coloured
 * sentence. All values are the boss's real NpcParam resistance table — no wiki.
 *
 * Bosses (and elite/unique enemies) get the Build tab on top of that intel;
 * every other enemy with a resistance table lands straight on the intel, with no
 * tab bar at all — see has-build-advisor.
 */
const CombatTips = ({
  marker,
  combat,
  onBack,
  onClose,
  onSelectItem,
}: {
  marker: Marker;
  combat: Combat;
  onBack: () => void;
  onClose: () => void;
  onSelectItem: (itemKey: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const showBuild = hasBuildAdvisor(marker);
  const [selectedTab, setTab] = useState<"build" | "intel">("build");
  // Without a build there is nothing to switch between — the page IS the intel.
  const tab = showBuild ? selectedTab : "intel";
  const weak = combat.damage.filter((d) => isWeak(d.mult));
  const resist = combat.damage.filter((d) => isResist(d.mult));
  const neutral = combat.damage.filter((d) => !isWeak(d.mult) && !isResist(d.mult));
  const meta = marker.bossMeta;

  // Status grouped by tier, kept in most-effective → immune order.
  const TIER_ORDER: StatusTier[] = ["effective", "moderate", "resistant", "immune"];
  const statusGroups = groupBy(combat.status, (s) => s.tier, (s) => s.type).sort(
    (a, b) => TIER_ORDER.indexOf(a.key as StatusTier) - TIER_ORDER.indexOf(b.key as StatusTier),
  );

  return (
    <>
      <button
        data-detail-back
        onClick={onBack}
        className="flex w-full shrink-0 items-center gap-1 px-4 pt-3 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
      >
        <ChevronLeft size={15} aria-hidden="true" />
        <span className="truncate">{t("detail.backTo", { label: marker.name })}</span>
      </button>

      <header className="relative shrink-0 px-4 pb-3 pt-2.5">
        <button
          onClick={onClose}
          aria-label={t("detail.closeDetails")}
          className="absolute right-3 top-2 grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={16} aria-hidden="true" />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
          {t(showBuild ? "detail.bossBuild" : "detail.combatTips")}
        </p>
        <h2 className="mt-0.5 pr-8 text-base font-semibold leading-tight text-white">{marker.name}</h2>
        {(meta?.poise || meta?.runes) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* HP moved into its own card below — it needs the scaling breakdown next to it. */}
            {meta?.poise ? <MetaBadge label={t("detail.poise")} value={meta.poise.toLocaleString(i18n.language)} /> : null}
            {meta?.runes ? <MetaBadge label={t("detail.runes")} value={meta.runes.toLocaleString(i18n.language)} /> : null}
          </div>
        )}
      </header>

      {showBuild && (
      <div className="mx-4 mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-border bg-black/20 p-1">
        {(["build", "intel"] as const).map((value) => {
          const Icon = value === "build" ? Gauge : ScrollText;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-[11px] font-semibold transition-colors cursor-pointer",
                tab === value ? "bg-white/[0.09] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <Icon size={13} aria-hidden="true" />
              {t(`detail.combatTab.${value}`)}
              {/* The advisor is still tuning its weightings — flag it in the display
                  face (Cinzel) so the badge reads as a stamp, not part of the label. */}
              {value === "build" && (
                <span
                  className={cn(
                    "rounded-full border px-1.5 pb-px font-display text-[8px] font-semibold uppercase leading-[1.4] tracking-[0.12em] transition-colors",
                    tab === "build"
                      ? "border-accent/45 bg-accent/15 text-accent"
                      : "border-white/10 bg-white/[0.04] text-zinc-500",
                  )}
                >
                  {t("detail.combatTab.beta")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5">
        {/* Pinned to the panel's no-scrollbar content width (inner − this
            container's 2rem px-4): the 8px bar rides inside the right padding,
            so rows never shift and no gutter is reserved. */}
        <div className="w-[calc(min(20.5rem,100vw_-_3rem)_-_2px)] space-y-4">

        {tab === "build" ? (
          <BuildAdvisor
            key={i18n.language}
            bossName={marker.name}
            markerId={marker.id}
            encounterCategory={marker.category}
            encounterLayer={marker.layer}
            npcParamId={marker.npcParamId}
            bossHp={marker.bossMeta?.hp}
            bossRunes={marker.bossMeta?.runes}
            bossPoise={marker.bossMeta?.poise}
            bossRegion={marker.region}
            bossScaleRegion={marker.bossMeta?.hpScale?.region}
            combat={combat}
            onSelectItem={onSelectItem}
          />
        ) : (
          <>


        {weak.length > 0 && (
          <Group title={t("detail.weaknessesTitle")}>
            {groupBy(weak, (d) => d.mult, (d) => d.type).map((g) => (
              <Row key={g.key}>{damageSentence(g.key as number, g.types)}</Row>
            ))}
          </Group>
        )}

        {statusGroups.length > 0 && (
          <Group title={t("detail.statusEffectsTitle")}>
            {statusGroups.map((g) => (
              <Row key={g.key}>{statusSentence(g.key as StatusTier, g.types)}</Row>
            ))}
            <StatusPrimer types={combat.status.map((s) => s.type)} />
          </Group>
        )}

        {resist.length > 0 && (
          <Group title={t("detail.resistancesTitle")}>
            {groupBy(resist, (d) => d.mult, (d) => d.type).map((g) => (
              <Row key={g.key}>{damageSentence(g.key as number, g.types)}</Row>
            ))}
          </Group>
        )}

        {neutral.length > 0 && (
          <Group title={t("detail.neutralDamageTitle")}>
            {groupBy(neutral, (d) => d.mult, (d) => d.type).map((g) => (
              <Row key={g.key}>{damageSentence(g.key as number, g.types)}</Row>
            ))}
          </Group>
        )}
          </>
        )}
        </div>
      </div>
    </>
  );
};

export default CombatTips;
