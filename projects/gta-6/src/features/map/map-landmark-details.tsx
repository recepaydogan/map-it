import { Check, CheckCircle2, CircleDashed, Copy, Crosshair, MapPin, Type, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import type { LandmarkStatus, MapLandmark } from "./map-landmark-types";

const meaningfulAddress = (address: string) => {
  const cleaned = address.trim().replace(/^\?\s*,?\s*/, "");
  return cleaned && !/^(unknown|n\/a|\?+)$/i.test(cleaned) ? cleaned : "";
};

/** The same inset, 16:9 photographic treatment used by the Elden Ring detail panel. */
function LandmarkPhoto({ source, name }: { source: string; name: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  if (state === "failed") return null;
  return <div className="landmark-photo" aria-busy={state === "loading"}>
    {state === "loading" && <div className="absolute inset-0 animate-pulse bg-white/[0.06]" />}
    <img src={contentUrl(source)} alt={name} decoding="async"
      onLoad={() => setState("ready")} onError={() => setState("failed")}
      className={`h-full w-full object-cover transition-opacity duration-200 ${state === "ready" ? "opacity-100" : "opacity-0"}`} />
  </div>;
}

export function MapLandmarkIntro({ landmark, name }: { landmark: MapLandmark; name: string }) {
  if (!landmark.gamePhoto && !landmark.description?.trim()) return null;
  return <div className="landmark-intro">
    {landmark.gamePhoto && <LandmarkPhoto key={landmark.gamePhoto} source={landmark.gamePhoto} name={name} />}
    {landmark.description?.trim() && <p className="landmark-description">{landmark.description}</p>}
  </div>;
}

function StatusCard({ label, value, icon: Icon }: { label: string; value: LandmarkStatus; icon: LucideIcon }) {
  const { t } = useTranslation();
  if (value === "unknown") return null;
  const StatusIcon = value === "confirmed" ? CheckCircle2 : CircleDashed;
  return <div className="landmark-status-card">
    <span className="landmark-status-label"><Icon size={13} aria-hidden="true" />{label}</span>
    <span className={`landmark-status-value ${value === "confirmed" ? "text-success-text" : "text-forever-blue"}`}>
      <StatusIcon size={15} aria-hidden="true" />{t(`map.landmarks.status.${value}`)}
    </span>
  </div>;
}

/** Shared by mapped locations and catalog records awaiting coordinates. */
export default function MapLandmarkDetails({ landmark, name, showIntro = true }: { landmark: MapLandmark; name: string; showIntro?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const inGame = meaningfulAddress(landmark.inGameAddress);
  const coordinates = landmark.gameCoordinates;
  const copyCoordinates = async () => {
    if (!coordinates) return;
    try { await navigator.clipboard.writeText(`${coordinates.x.toFixed(3)}, ${coordinates.y.toFixed(3)}`); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  };
  return <section className="landmark-details" aria-label={t("map.landmarks.details")}>
    {showIntro && <MapLandmarkIntro landmark={landmark} name={name} />}
    {(landmark.nameStatus !== "unknown" || landmark.positionStatus !== "unknown") && <div className="landmark-status-grid">
      <StatusCard label={t("map.landmarks.nameStatus")} value={landmark.nameStatus} icon={Type} />
      <StatusCard label={t("map.landmarks.positionStatus")} value={landmark.positionStatus} icon={MapPin} />
    </div>}
    {inGame && <div className="landmark-address">
      <MapPin size={16} aria-hidden="true" />
      <div><h3 className="map-micro-label">{t("map.landmarks.inGame")}</h3><p>{inGame}</p></div>
    </div>}
    {coordinates && <footer className="landmark-coordinates">
      <div className="landmark-coordinates-heading"><h3><Crosshair size={14} aria-hidden="true" />{t("map.landmarks.gameCoordinates")}</h3>
        <button type="button" onClick={copyCoordinates} className="map-icon-button"
          aria-label={t(copied ? "map.landmarks.coordinatesCopied" : "map.details.copyCoordinates")} title={t("map.details.copyCoordinates")}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>
      <dl className="landmark-coordinate-grid">
        <div><dt>{t("map.landmarks.coordinateX")}</dt><dd>{coordinates.x.toFixed(3)}</dd></div>
        <div><dt>{t("map.landmarks.coordinateY")}</dt><dd>{coordinates.y.toFixed(3)}</dd></div>
      </dl>
      {copyFailed && <p role="status" className="mt-2 text-xs text-danger-text">{t("map.landmarks.copyFailed")}</p>}
    </footer>}
  </section>;
}
