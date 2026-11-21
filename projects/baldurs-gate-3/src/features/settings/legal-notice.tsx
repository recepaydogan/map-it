import { ExternalLink, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import { openExternalUrl } from "../../utils/platform";

/** "Unofficial companion" disclaimer, worded from GAME_CONFIG. */
const LegalNotice = () => {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface/60 px-4 py-3.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] bg-white/6 text-muted">
        <Info size={14} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] leading-relaxed text-muted">
          {t("settings.unofficialDisclaimer", {
            game: GAME_CONFIG.gameName,
            developer: GAME_CONFIG.developerName,
          })}
        </p>
        {GAME_CONFIG.developerTermsUrl && (
          <button
            type="button"
            onClick={() => openExternalUrl(GAME_CONFIG.developerTermsUrl)}
            className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold text-accent transition-colors hover:text-[var(--gold-bright)]"
          >
            {t("settings.developerTerms", { developer: GAME_CONFIG.developerName })}
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export default LegalNotice;
