import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { SupportStatus } from "../../services/support/support-service";

const SupportStatusChip = ({
  status,
  className,
}: {
  status: SupportStatus;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span className={cn("map-it-support-status", className)} data-status={status}>
      {t(`support.status.${status}`)}
    </span>
  );
};

export default SupportStatusChip;


