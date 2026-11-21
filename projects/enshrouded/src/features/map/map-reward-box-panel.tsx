import { useTranslation } from "react-i18next";
import RewardBoxDetail from "../reference/reward-box-detail";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceTarget } from "../reference/reference-types";
import { useRewardBoxCatalog } from "../reference/use-reference-data";

const MapRewardBoxPanel = ({ target, onOpenMap }: {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const state = useRewardBoxCatalog();
  if (state.status !== "ready") return <p className="p-4 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const family = state.data.families.find((entry) => entry.id === target.id || entry.variantIds.includes(target.id));
  if (!family) return <p role="alert" className="p-4 text-sm text-subtle">{t("reference.error")}</p>;
  return <RewardBoxDetail summary={family}
    editions={state.data.families.filter((entry) => entry.name === family.name && entry.technical === family.technical)}
    selectedId={family.variantIds.includes(target.id) ? target.id : family.variantIds[0]}
    onSelectVariant={(id) => openReference({ category: "boxes", id, name: family.name })}
    onOpenMap={onOpenMap} />;
};

export default MapRewardBoxPanel;
