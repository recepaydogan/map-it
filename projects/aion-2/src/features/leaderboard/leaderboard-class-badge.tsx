import { CLASS_LEADERBOARD_EMBLEMS } from "../../game-config";
import { contentUrl } from "../../lib/content-url";

const LeaderboardClassBadge = ({ className }: { className: string }) => {
  const emblem = CLASS_LEADERBOARD_EMBLEMS[className as keyof typeof CLASS_LEADERBOARD_EMBLEMS];
  if (!emblem) return null;
  return <span className="relative inline-block size-5 shrink-0 overflow-hidden" aria-hidden="true">
    <img src={contentUrl(emblem)} alt="" loading="lazy" className="absolute -left-[10px] -top-[16px] w-[122px] max-w-none" />
  </span>;
};

export default LeaderboardClassBadge;
