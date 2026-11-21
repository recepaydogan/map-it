import { useTranslation } from "react-i18next";
import { nativeFieldLabel } from "./native-wiki-labels";
import type { NativeWikiEntry } from "./use-native-wiki";

type Attribute = NonNullable<NativeWikiEntry["attributes"]>[string];
const baseValue = (attribute: Attribute) => attribute.fields?.Base ?? attribute.native_value;

/** Base values only; scaling evidence stays in data files rather than guessed live stats. */
const NativeWikiAttributeCards = ({ attributes }: { attributes: NonNullable<NativeWikiEntry["attributes"]> }) => {
  const { t, i18n } = useTranslation();
  const groups = ["combat", "resistances", "movement"] as const;
  const groupOf = (key: string) => key.startsWith("Resistance_") ? "resistances" : /Speed$/.test(key) ? "movement" : "combat";
  return <div className="native-wiki-attribute-cards @container space-y-4">
    {groups.map(group => {
      const rows = Object.entries(attributes).filter(([key]) => groupOf(key) === group);
      if (!rows.length) return null;
      return <section key={group} className="rounded-[var(--radius-md)] border border-border px-4 py-3">
        <h4 className="mb-1 text-sm font-medium text-zinc-100">{t(`wiki.attributeGroups.${group}`)}</h4>
        <dl className="grid gap-x-6 @min-[540px]:grid-cols-2 @min-[960px]:grid-cols-3">
          {rows.map(([key, attribute]) => {
            const base = baseValue(attribute);
            return <div key={key} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border/60 py-2.5 text-[13px] leading-snug">
              <dt className="min-w-0 text-subtle">{nativeFieldLabel(key)}</dt>
              <dd className="shrink-0 tabular-nums text-zinc-100">{typeof base === "number" && Number.isFinite(base)
                ? base.toLocaleString(i18n.language, { maximumSignificantDigits: 15 }) : typeof base === "string" ? base : "—"}</dd>
            </div>;
          })}
        </dl>
      </section>;
    })}
  </div>;
};
export default NativeWikiAttributeCards;
