import { ChevronLeft } from "lucide-react";

interface DetailBackLinkProps {
  label: string;
  onClick: () => void;
}

/**
 * The "‹ Back to …" row a drilled-into detail panel wears above its header, so
 * the panel that opened it is always one click away.
 */
const DetailBackLink = ({ label, onClick }: DetailBackLinkProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 px-4 pt-3 text-left text-[12px] font-medium text-subtle transition-colors hover:text-white"
  >
    <ChevronLeft size={15} aria-hidden="true" />
    <span className="truncate">{label}</span>
  </button>
);

export default DetailBackLink;
