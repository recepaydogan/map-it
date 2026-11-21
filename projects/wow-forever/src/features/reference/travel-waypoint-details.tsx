import { useTranslation } from "react-i18next";

const TravelWaypointDetails = () => {
  const { t } = useTranslation();
  return <p className="text-[13px] leading-relaxed text-zinc-300">{t("reference.travel.waypointArrival")}</p>;
};

export default TravelWaypointDetails;
