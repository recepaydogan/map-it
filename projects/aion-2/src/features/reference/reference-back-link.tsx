import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const ReferenceBackLink = ({ label, onBack }: { label?: string; onBack?: () => void }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  if (!label || !onBack) return null;
  return <button type="button" onClick={onBack}
    className="relative mb-4 flex max-w-[760px] cursor-pointer items-center gap-1.5 text-[12px] font-medium text-white hover:text-white">
    <ChevronLeft size={15} aria-hidden="true" />
    <span className="truncate">{t("reference.backTo", { label: getItemDisplayName(label, gameText(label)) })}</span>
  </button>;
};

export default ReferenceBackLink;
