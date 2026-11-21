import { ChevronRight, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OVERWOLF_STORE_URL } from "../../utils/external-links";
import { useGetApp } from "./get-app-store";

/**
 * The phone's version of the download CTA, for the navigation drawer.
 *
 * A card rather than another nav row: it is an offer, not a destination, and the
 * rows around it all lead somewhere inside the app. Opening the pitch closes the
 * drawer first — the dialog is portalled to `document.body` at z-1700 and the
 * drawer sits above it at z-1800, so they cannot both be on screen.
 */
const GetAppCard = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation();
  const show = useGetApp((state) => state.show);

  if (!OVERWOLF_STORE_URL) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onOpen();
        show("menu");
      }}
      className="mx-3 mb-1 flex items-center gap-3 rounded-[var(--radius-md)] border border-accent/35 bg-accent/10 px-3 py-2.5 text-left transition-colors hover:bg-accent/15 cursor-pointer"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/25 bg-black/25 text-accent">
        <Download size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold leading-tight text-zinc-100">
          {t("getApp.menuTitle")}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-zinc-400">
          {t("getApp.menuBody")}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-accent" aria-hidden="true" />
    </button>
  );
};

export default GetAppCard;
