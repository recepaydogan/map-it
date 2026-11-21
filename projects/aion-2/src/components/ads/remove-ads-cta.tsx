import { useTranslation } from "react-i18next";
import banner from "./remove-ads-banner-v2.webp";
import "./remove-ads-cta.css";

/** Reserved footer outside the SDK containers; hidden during a high-impact ad. */
export default function RemoveAdsCta({ onActivate }: { onActivate?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-[60px] w-full items-center justify-center p-1.5">
      <button
        type="button"
        onClick={onActivate}
        disabled={!onActivate}
        aria-haspopup="dialog"
        aria-label={`${t("ads.removeAds")} · ${t("ads.moreMapSpace")} · ${t("ads.goPremium")}`}
        className="remove-ads-cta relative block w-full max-w-[400px] enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default"
      >
        <img src={banner} alt="" width={1284} height={190} draggable={false} className="pointer-events-none block h-12 w-full select-none object-fill" />
        <img src={banner} alt="" aria-hidden="true" width={1284} height={190} draggable={false} className="remove-ads-cta-highlight pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
      </button>
    </div>
  );
}
