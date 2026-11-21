import { findMapApp } from "../app-library/app-selection";

export default function SupportGameBadge({ gameId }: { gameId: string }) {
  const app = findMapApp(gameId);
  if (!app) return null;
  return <span className="map-it-support-game">
    <img src={app.icon} alt="" />
    <span className="truncate">{app.name}</span>
  </span>;
}
