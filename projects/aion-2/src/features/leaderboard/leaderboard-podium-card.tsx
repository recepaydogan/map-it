import { Crown, Medal, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { characterProfileImageUrl } from "../character-profiles/character-profile-image-url";
import type { LeaderboardEntry } from "./leaderboard-api";
import LeaderboardClassBadge from "./leaderboard-class-badge";
import "./leaderboard-podium-card.css";

const LeaderboardPodiumCard = ({ entry, personal, onOpen }: {
  entry: LeaderboardEntry;
  personal: boolean;
  onOpen: (entry: LeaderboardEntry, button: HTMLButtonElement) => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const portrait = characterProfileImageUrl(entry.profileImageUrl);

  return <button type="button" onClick={(event) => onOpen(entry, event.currentTarget)}
    aria-label={t("leaderboard.rowLabelFull", { rank: entry.rank, name: entry.name, className: gameText(entry.className), region: t(`characterProfiles.regions.${entry.region}`), server: entry.serverName, score: entry.gearScore.toLocaleString(i18n.language), combatPower: entry.combatPower.toLocaleString(i18n.language) })}
    className={cn("podium-card", `podium-card--${entry.rank}`)}>
    <span className="podium-card__stage" aria-hidden="true">
      <span className="podium-card__rank">{String(entry.rank).padStart(2, "0")}</span>
      <span className="podium-card__crest">{entry.rank === 1 ? <Crown size={21} strokeWidth={1.5} /> : <Medal size={19} strokeWidth={1.5} />}</span>
      <span className="podium-card__portrait-frame">
        <span className="podium-card__portrait">
          <UserRound size={32} strokeWidth={1.3} />
          {portrait && <img src={portrait} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
        </span>
      </span>
    </span>
    <span className="podium-card__identity">
      <span className="podium-card__name" title={entry.name}>{entry.name}</span>
      {personal && <span className="podium-card__personal">{t("leaderboard.yourCharacter")}</span>}
      <span className="podium-card__class"><LeaderboardClassBadge className={entry.className} />{gameText(entry.className)}</span>
    </span>
    <span className="podium-card__location">
      <span className="podium-card__location-field"><span>{t("leaderboard.region")}</span><strong>{t(`characterProfiles.regions.${entry.region}`)}</strong></span>
      <span className="podium-card__location-field"><span>{t("leaderboard.server")}</span><strong title={entry.serverName}>{entry.serverName}</strong></span>
    </span>
    <span className="podium-card__metrics">
      <span className="podium-card__metric"><span>{t("leaderboard.gearScore")}</span><strong className="podium-card__metric-value--gear">{entry.gearScore.toLocaleString(i18n.language)}</strong></span>
      <span className="podium-card__metric"><span>{t("characterProfiles.combatPower")}</span><strong className="podium-card__metric-value--combat">{entry.combatPower.toLocaleString(i18n.language)}</strong></span>
    </span>
  </button>;
};

export default LeaderboardPodiumCard;
