import { useTranslation } from "react-i18next";
import ClassGearingPanel from "./class-gearing-panel";

const ClassGuideGearSection = ({ classId, tree, mode, cap, level }: {
  classId: string;
  tree: string;
  mode: "pve" | "pvp";
  cap: number;
  level: number;
}) => {
  const { t } = useTranslation();

  return <section aria-label={t("classGuide.gear.title")}>
    <h3 className="mb-3 font-display text-lg font-semibold text-white">{t("classGuide.gear.title")}</h3>
    <ClassGearingPanel embedded key={level} classId={classId} tree={tree} mode={mode} cap={cap} selectedLevel={level} />
  </section>;
};

export default ClassGuideGearSection;
