import DatabaseSectionTitle from "../database/database-section-title";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import type { SearchSourceContext } from "./map-global-search";

/** Keep the selected acquisition route visible after a cross-map search jump. */
export default function MapSearchSourceDetails({ context }: { context: SearchSourceContext }) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const { item, source } = context;
  const path = [...(source.via ?? []), { ...item, category: "items" }];
  return <section aria-label={t("map.search.sourceDetails")} className="mt-4 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.search.sourceDetails")}</DatabaseSectionTitle>
    <p className="mt-1 text-[11px] text-accent">
      {[source.originKind, source.kind].filter(Boolean).map(kind => t(`map.search.sourceKinds.${kind}`)).join(" · ")}
    </p>
    {(source.kind === "quest" || source.originKind === "quest") && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("map.search.questRoute")}</p>}
    {source.kind === "container" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("map.search.containerRoute")}</p>}
    <ol className="mt-2 space-y-1">
      {path.map((entry, index) => <li key={`${entry.category}:${entry.id}:${index}`}>
        <button type="button" onClick={() => openReference(entry)}
          aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, entry) : undefined}
          className={cn("flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-zinc-100 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent",
            sameReferenceTarget(selectedReference, entry) && "bg-accent-soft ring-1 ring-inset ring-accent/60")}>
          <span className="shrink-0 text-[10px] tabular-nums text-subtle">{index + 1}.</span>
          {index === path.length - 1 && <ItemIcon icon={item.icon} name={getItemDisplayName(item.name, gameText(item.name, item.id))} size={24} />}
          <span className="min-w-0 break-words">{getItemDisplayName(entry.name, gameText(entry.name, entry.id))}</span>
        </button>
      </li>)}
    </ol>
    {!!source.price?.length && <p className="mt-2 text-xs text-accent">{source.price.map(price => `${price.amount.toLocaleString(i18n.language)} ${gameText(price.currency)}`).join(" + ")}</p>}
    {!!source.rates?.length && <ReferenceRewardRates rates={source.rates} />}
  </section>;
}
