import { Shield, Skull, Sparkles } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { type NightlordMeta } from "../../data/nightreign-data";
import {
  type StatusTier,
  colorFor,
  dmgPct,
  isResist,
  isWeak,
} from "../../data/combat";

// Madness/Sleep aren't damage channels (so not in COMBAT_COLOR) but ARE registry weaknesses.
const weakColor = (w: string): string =>
  ({ Madness: "#d8a531", Sleep: "#c084fc" } as Record<string, string>)[w] ?? colorFor(w);

// Damage/physical channels that appear in the raw NpcParam table — so we can tell whether the
// official (effectiveAffinity) weakness is a damage type that diverges from the base stats.
const DMG_TYPES = new Set([
  "Physical", "Standard", "Slash", "Strike", "Pierce", "Magic", "Fire", "Lightning", "Holy",
]);

const iconUrl = (id?: number) => (id != null ? `/icons/nightreign/menu/${id}.png` : undefined);

/** Round Nightlord medallion (the in-game emblem). Shared by the picker and the detail page. */
export const Emblem = ({ id, size, className = "" }: { id?: number; size: number; className?: string }) =>
  id != null ? (
    <img
      src={iconUrl(id)}
      alt=""
      draggable={false}
      width={size}
      height={size}
      className={`rounded-[var(--radius-full)] object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`grid place-items-center rounded-[var(--radius-full)] bg-white/5 ${className}`}
      style={{ width: size, height: size }}
    >
      <Skull size={size * 0.4} className="text-zinc-400" aria-hidden="true" />
    </span>
  );

/* ── Combat-tips-style sentence rendering (mirrors features/detail/combat-tips.tsx) ── */

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

const DamageSentence = ({ mult, types }: { mult: number; types: string[] }) => {
  const p = dmgPct(mult);
  const list = <TypeList types={types} />;
  if (isWeak(mult))
    return (
      <Trans
        i18nKey="nightreign.takesExtraDamage"
        values={{ pct: p }}
        components={{ extra: <span className="font-semibold text-emerald-300" />, list }}
      />
    );
  if (isResist(mult))
    return <Trans i18nKey="nightreign.takesLessDamage" values={{ pct: p }} components={{ list }} />;
  return <Trans i18nKey="nightreign.takesNormalDamage" components={{ list }} />;
};

const StatusSentence = ({ tier, types }: { tier: StatusTier; types: string[] }) => {
  const list = <TypeList types={types} />;
  const many = types.length > 1;
  switch (tier) {
    case "effective":
      return many ? (
        <Trans i18nKey="nightreign.statusEffective_many" components={{ list }} />
      ) : (
        <Trans i18nKey="nightreign.statusEffective_one" components={{ list }} />
      );
    case "moderate":
      return many ? (
        <Trans i18nKey="nightreign.statusModerate_many" components={{ list }} />
      ) : (
        <Trans i18nKey="nightreign.statusModerate_one" components={{ list }} />
      );
    case "resistant":
      return many ? (
        <Trans i18nKey="nightreign.statusResistant_many" components={{ list }} />
      ) : (
        <Trans i18nKey="nightreign.statusResistant_one" components={{ list }} />
      );
    case "immune":
      return many ? (
        <Trans i18nKey="nightreign.statusImmune_many" components={{ list }} />
      ) : (
        <Trans i18nKey="nightreign.statusImmune_one" components={{ list }} />
      );
  }
};

function groupBy<T>(items: T[], keyOf: (x: T) => number | string, typeOf: (x: T) => string) {
  const out: { key: number | string; types: string[] }[] = [];
  const idx = new Map<number | string, number>();
  for (const it of items) {
    const k = keyOf(it);
    if (!idx.has(k)) { idx.set(k, out.length); out.push({ key: k, types: [] }); }
    out[idx.get(k)!].types.push(typeOf(it));
  }
  return out;
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2 text-[12.5px] leading-relaxed text-zinc-300">
    {children}
  </p>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    <div className="flex flex-col gap-1.5">{children}</div>
  </div>
);

const MetaBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="rounded-[var(--radius-full)] bg-white/8 px-2.5 py-1 text-[11px] font-medium text-zinc-100">
    <span className="text-zinc-500">{label} </span>
    <span className="tabular-nums">{value}</span>
  </span>
);

/** Full Nightlord "page" — hero medallion + official weakness + extracted HP/poise and the
 *  combat-tips resistance breakdown. The final-night boss never appears on the map, so this
 *  is where a player studies who they're building toward. Reused both inside the Nightreign
 *  picker and as the auto-opened panel when GEP reports a Nightreign boss_fight. */
export const NightlordDetail = ({ name, m }: { name: string; m: NightlordMeta | undefined }) => {
  const { t } = useTranslation();
  const c = m?.combat;
  const weak = c?.damage.filter((d) => isWeak(d.mult)) ?? [];
  const resist = c?.damage.filter((d) => isResist(d.mult)) ?? [];
  const neutral = c?.damage.filter((d) => !isWeak(d.mult) && !isResist(d.mult)) ?? [];
  const divergent = c ? m!.weakness.filter((w) => DMG_TYPES.has(w) && !weak.some((d) => d.type === w)) : [];

  const TIER_ORDER: StatusTier[] = ["effective", "moderate", "resistant", "immune"];
  const statusGroups = c
    ? groupBy(c.status, (s) => s.tier, (s) => s.type).sort(
        (a, b) => TIER_ORDER.indexOf(a.key as StatusTier) - TIER_ORDER.indexOf(b.key as StatusTier),
      )
    : [];
  const glow = m && m.weakness.length > 0 ? weakColor(m.weakness[0]) : "#8b5cf6";

  return (
    <div className="flex min-w-0 flex-col">
      {/* Hero */}
      <div className="relative overflow-hidden px-4 pb-3 pt-4">
        <div
          className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 opacity-60 blur-xl"
          style={{ background: `radial-gradient(circle, ${glow}66, transparent 70%)` }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-[var(--radius-full)] blur-md"
              style={{ background: `radial-gradient(circle, ${glow}aa, transparent 70%)` }}
              aria-hidden="true"
            />
            <Emblem
              id={m?.iconId}
              size={84}
              className="relative ring-1 ring-white/15"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{t("nightreign.night3Boss")}</p>
            <h2 className="truncate text-lg font-semibold leading-tight text-white">{name}</h2>
            <p className="truncate text-[12px] text-zinc-400">
              {m?.bossForm ?? name}
              {m?.dlc ? " · DLC" : ""}
            </p>
          </div>
        </div>

        {/* Official weakness — the headline */}
        {m && m.weakness.length > 0 && (
          <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("nightreign.weakTo")}</span>
            {m.weakness.map((w) => (
              <span
                key={w}
                className="flex items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-0.5 text-[12px] font-semibold"
                style={{ color: weakColor(w), backgroundColor: `${weakColor(w)}26`, boxShadow: `inset 0 0 0 1px ${weakColor(w)}44` }}
              >
                {t(`combatType.${w}`, { defaultValue: w })}
              </span>
            ))}
          </div>
        )}

        {/* Extracted vitals */}
        {(m?.hp != null || m?.poise != null) && (
          <div className="relative mt-2 flex flex-wrap gap-1.5">
            {m?.hp != null && <MetaBadge label={t("nightreign.hp")} value={m.hp.toLocaleString()} />}
            {m?.poise != null && <MetaBadge label={t("nightreign.poise")} value={m.poise.toLocaleString()} />}
          </div>
        )}
      </div>

      <div className="space-y-3.5 px-4 pb-4">
        {/* Divergence between the in-game weakness and the raw base table */}
        {divergent.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-200/90">
            <Sparkles size={13} className="mt-px shrink-0" aria-hidden="true" />
            <span>
              <Trans
                i18nKey="nightreign.divergentWeakness"
                components={{
                  list: (
                    <>
                      {divergent.map((w, i) => (
                        <span key={w}>
                          <span className="font-semibold" style={{ color: weakColor(w) }}>{t(`combatType.${w}`, { defaultValue: w })}</span>
                          {i < divergent.length - 1 ? " / " : ""}
                        </span>
                      ))}
                    </>
                  ),
                }}
              />
            </span>
          </p>
        )}

        {c ? (
          <>
            {weak.length > 0 && (
              <Group title={t("nightreign.weaknessesBringThese")}>
                {groupBy(weak, (d) => d.mult, (d) => d.type).map((g) => (
                  <Row key={g.key}><DamageSentence mult={g.key as number} types={g.types} /></Row>
                ))}
              </Group>
            )}
            {statusGroups.length > 0 && (
              <Group title={t("nightreign.statusEffects")}>
                {statusGroups.map((g) => (
                  <Row key={g.key}><StatusSentence tier={g.key as StatusTier} types={g.types} /></Row>
                ))}
              </Group>
            )}
            {resist.length > 0 && (
              <Group title={t("nightreign.resistancesAvoidThese")}>
                {groupBy(resist, (d) => d.mult, (d) => d.type).map((g) => (
                  <Row key={g.key}><DamageSentence mult={g.key as number} types={g.types} /></Row>
                ))}
              </Group>
            )}
            {neutral.length > 0 && (
              <Group title={t("nightreign.neutralDamage")}>
                {groupBy(neutral, (d) => d.mult, (d) => d.type).map((g) => (
                  <Row key={g.key}><DamageSentence mult={g.key as number} types={g.types} /></Row>
                ))}
              </Group>
            )}
          </>
        ) : (
          <p className="flex items-start gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-2.5 py-2 text-[11.5px] leading-relaxed text-zinc-500">
            <Shield size={13} className="mt-px shrink-0" aria-hidden="true" />
            {t("nightreign.noStatRow")}
          </p>
        )}

        {/* Lore — the in-game description */}
        {m?.description && (
          <p className="whitespace-pre-line border-t border-border pt-3 text-[11.5px] italic leading-relaxed text-zinc-500">
            {m.description}
          </p>
        )}
      </div>
    </div>
  );
};

export default NightlordDetail;
