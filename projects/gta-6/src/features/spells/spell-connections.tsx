import { useTranslation } from "react-i18next";
import SpellLink from "./spell-link";
import type { SpellDetail, SpellIndexRow } from "./spell-data";

const relationKey = (direction: "out" | "in", kind: string) => {
  if (kind === "triggers" || kind === "enchant" || kind === "teaches") return `spells.relations.${direction}.${kind}`;
  return `spells.relations.${direction}.other`;
};

const RelatedSpell = ({ id, byId }: { id: number; byId: Map<number, SpellIndexRow> }) => {
  const { t } = useTranslation();
  const row = byId.get(id);
  return row ? <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5"><SpellLink id={id} name={row[2] ? `${row[1]} (${row[2]})` : row[1]} /><span className="text-[10px] tabular-nums text-subtle">#{id}</span></span>
    : <span className="text-subtle">{t("spells.spellNumber", { id })} · {t("spells.serverSide")}</span>;
};

export const SpellPartOf = ({ detail, byId }: { detail: SpellDetail; byId: Map<number, SpellIndexRow> }) => {
  const { t } = useTranslation();
  if (!detail.of) return null;
  const [id, kind] = detail.of;
  const key = ["triggers", "enchant", "teaches", "copy", "named"].includes(kind) ? kind : "other";
  return <p className="rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2.5 text-[12px] leading-5 text-zinc-200">{t(`spells.partOfKind.${key}`)} <RelatedSpell id={id} byId={byId} />.</p>;
};

export const SpellConnections = ({ detail, byId }: { detail: SpellDetail; byId: Map<number, SpellIndexRow> }) => {
  const { t } = useTranslation();
  const linkedEffects = new Set((detail.ef ?? []).map((effect) => effect.tr
    || ((effect.a === 42 || effect.a === 23) && effect.v && effect.v > 1000 && byId.has(effect.v) ? effect.v : 0)));
  const outgoing = (detail.tr ?? []).filter(([id, kind]) => kind !== "triggers" || !linkedEffects.has(id));
  const incoming = detail.tb ?? [];
  if (!outgoing.length && !incoming.length) return null;
  return <div className="space-y-1.5" aria-label={t("spells.related")}>
      {outgoing.map(([id, kind], index) => <div key={`out-${id}-${kind}-${index}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2 text-[12px]">
        <span className="text-subtle">{t(relationKey("out", kind))}</span><RelatedSpell id={id} byId={byId} />
      </div>)}
      {incoming.map(([id, kind], index) => <div key={`in-${id}-${kind}-${index}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2 text-[12px]">
        <span className="text-subtle">{t(relationKey("in", kind))}</span><RelatedSpell id={id} byId={byId} />
      </div>)}
  </div>;
};
