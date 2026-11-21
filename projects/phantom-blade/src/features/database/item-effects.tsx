import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "./database-section-title";
import { splitItemEffects } from "./item-effect-description";

const EffectRows = ({ text }: { text: string }) => <dl className="divide-y divide-border/50">{text.split("\n").filter(Boolean).map((line, index) => {
  const separator = line.indexOf(":");
  return separator > 0 && line.slice(separator + 1).trim()
    ? <div key={index} className="flex min-w-0 items-baseline justify-between gap-4 py-2 text-[13px]">
      <dt className="min-w-0 text-zinc-300">{line.slice(0, separator).trim()}</dt>
      <dd className="shrink-0 text-right font-medium tabular-nums text-white">{line.slice(separator + 1).trim()}</dd>
    </div>
    : <div key={index} className="py-2 text-[13px] leading-relaxed text-zinc-300">{line}</div>;
})}</dl>;

const ItemEffects = ({ text, itemName, renderDescription }: { text: string; itemName: string; renderDescription?: (text: string) => ReactNode }) => {
  const { t } = useTranslation();
  const effects = splitItemEffects(text);
  const description = effects.description === `Grants [${itemName}].` ? "" : effects.description;
  return <div className="max-w-[760px] space-y-5">
    {description && <p className="border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed whitespace-pre-line text-zinc-300">{renderDescription ? renderDescription(description) : description}</p>}
    {(["equipped", "owned"] as const).map((kind) => effects[kind] && <section key={kind}>
      <DatabaseSectionTitle>{t(`database.compact.${kind}`)}</DatabaseSectionTitle>
      <EffectRows text={effects[kind]} />
    </section>)}
  </div>;
};

export default ItemEffects;
