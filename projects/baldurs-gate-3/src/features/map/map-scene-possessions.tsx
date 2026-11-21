import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ItemDatabaseEntry } from "../items/types";
import { useItemDatabase } from "../items/use-item-database";
import MapDetailSection from "./map-detail-section";
import MapItemLinkRow from "./map-item-link-row";
import { getMapScenePossessionGroups } from "./map-scene-possession-groups";
import type { MapSceneContext } from "./types";

interface MapScenePossessionsProps {
  scene: MapSceneContext;
  selectedItemId?: string;
  onSelectItem?: (item: ItemDatabaseEntry) => void;
}

const MapScenePossessions = ({ scene, selectedItemId, onSelectItem }: MapScenePossessionsProps) => {
  const { t, i18n } = useTranslation();
  const sectionId = useId();
  const { data, loading, error } = useItemDatabase();
  const groups = useMemo(() => getMapScenePossessionGroups(scene, data?.items), [scene, data]);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const localized = (values: Record<string, string>) => values[language] ?? values[language.split("-")[0]] ?? values.en;

  if (groups.length === 0) return null;

  return (
    <MapDetailSection id={sectionId} title={t("items.acquisition.certainty.story")}>
      {loading && <p role="status" className="mb-2.5 text-[12px] text-subtle">{t("items.loading")}</p>}
      {error && (
        <p role="alert" className="mb-2.5 text-[12px] leading-relaxed text-danger-text">
          {t("items.errorTitle")}. {t("items.errorBody")}
        </p>
      )}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="space-y-2.5">
            <p className="text-[12px] leading-relaxed text-subtle">{localized(group.localizedConditions)}</p>
            {group.branches.map((branch, branchIndex) => {
              const conditionId = `${sectionId}-${group.id}-${branchIndex}`;
              return (
                <div key={branch.id} className="space-y-2">
                  {branch.localizedConditions && (
                    <p id={conditionId} className="text-[12px] leading-relaxed text-subtle">
                      {localized(branch.localizedConditions)}
                    </p>
                  )}
                  <ul className="space-y-1.5" aria-describedby={branch.localizedConditions ? conditionId : undefined}>
                    {branch.rows.map(({ source, item }, rowIndex) => {
                      const displayName = localized(source.localizedNames) ?? source.title;
                      return (
                        <li key={`${source.itemId}-${rowIndex}`}>
                          <MapItemLinkRow
                            item={item}
                            displayName={displayName}
                            secondary={source.amount > 1 ? t("map.containerLoot.amount", { count: source.amount }) : undefined}
                            active={Boolean(item && item.id === selectedItemId)}
                            ariaLabel={t("items.detailsFor", { item: displayName })}
                            onSelect={onSelectItem}
                          />
                          {!item && !loading && !error && (
                            <details className="mt-1 text-[11px] text-subtle">
                              <summary className="cursor-pointer">{t("map.details.sourceEvidence")}</summary>
                              <code className="block break-all">{source.statsId} · {source.templateId}</code>
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {group.unresolvedEntries.length > 0 && (
              <details className="text-[11px] text-subtle">
                <summary className="cursor-pointer">{t("map.details.sourceEvidence")}</summary>
                <ul className="mt-1 space-y-2">
                  {group.unresolvedEntries.map((entry, entryIndex) => (
                    <li key={`${entry.statsId}-${entryIndex}`}>
                      <code className="block break-all">{entry.statsId}</code>
                      {entry.evidence.map((evidence, evidenceIndex) => (
                        <code key={evidenceIndex} className="mt-1 block break-all">
                          {evidence.sourcePath}:{evidence.sourceLine} — {evidence.statement}
                        </code>
                      ))}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </MapDetailSection>
  );
};

export default MapScenePossessions;
