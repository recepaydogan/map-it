import { getItemDisplayName } from "../../lib/item-display-name";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const ReferenceBackLink = ({ label, onBack }: { label?: string; onBack?: () => void }) => {
  const { t } = useTranslation();
  if (!label || !onBack) return null;
  return <button type="button" onClick={onBack}
    className="relative mb-4 flex max-w-[760px] cursor-pointer items-center gap-1.5 text-[12px] font-medium text-white">
    <ChevronLeft size={15} aria-hidden="true" />
    <span className="truncate">{t("reference.backTo", { label: getItemDisplayName(label) })}</span>
  </button>;
};

export default ReferenceBackLink;
