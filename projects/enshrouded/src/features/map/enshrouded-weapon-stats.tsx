import { useGameText } from "../../i18n/game-text";
import { useTranslation } from "react-i18next";

type WeaponFact = { name: string; value: string };

const statKeys: Record<string, string> = {
  level: "level",
  range: "range",
  attackspeed: "attackSpeed",
  drawspeed: "drawSpeed",
  arrowspeed: "arrowSpeed",
  parrypower: "parryPower",
  manaregeneration: "manaRegeneration",
  overcharge: "overcharge",
};

const normalizeName = (name: string) => name.toLocaleLowerCase("en").replace(/[\s_-]/g, "");
const readableName = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/^./, (letter) => letter.toUpperCase());

export default function EnshroudedWeaponStats({ facts }: { facts: WeaponFact[] }) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const perks = facts.filter((fact) => normalizeName(fact.name) === "perks")
    .flatMap((fact) => fact.value.split(",").map((perk) => perk.trim()).filter(Boolean));
  const perkCounts = new Map<string, { name: string; count: number }>();
  for (const perk of perks) {
    const key = perk.toLocaleLowerCase("en");
    const current = perkCounts.get(key);
    perkCounts.set(key, { name: current?.name ?? perk, count: (current?.count ?? 0) + 1 });
  }
  const stats = facts.filter((fact) => fact.value.trim() && normalizeName(fact.name) !== "perks");
  if (!stats.length && !perks.length) return null;

  return <section className="space-y-3 border-t border-border/60 pt-3">
    {stats.length > 0 && <>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {t("map.enshrouded.weaponStats.title")}</h3>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map((fact, index) => {
          const name = normalizeName(fact.name);
          const label = statKeys[name]
            ? t(`map.enshrouded.weaponStats.${statKeys[name]}`) : contentText(readableName(fact.name));
          return <div key={`${fact.name}:${index}`} className="min-w-0 rounded-md border border-border/70 bg-white/[0.035] px-3 py-2.5">
            <dt className="text-[10px] font-medium leading-snug text-zinc-400">{label}</dt>
            <dd className="mt-1 break-words text-[15px] font-semibold leading-tight tabular-nums text-zinc-100">
              {contentText(fact.value)}</dd>
          </div>;
        })}
      </dl>
    </>}
    {perks.length > 0 && <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {t("map.enshrouded.weaponStats.perks")}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {[...perkCounts.values()].map(({ name, count }) => <li key={name}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-accent/25 bg-accent-soft/20 px-2.5 py-1 text-[11px] font-medium leading-snug text-zinc-100">
          {contentText(name)}{count > 1 && <span className="font-semibold tabular-nums text-accent">×{count}</span>}
        </li>)}
      </ul>
    </div>}
  </section>;
}
