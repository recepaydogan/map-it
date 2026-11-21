import { MapPin, MapPinned, MousePointer2, Navigation, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapTownDropdown from "./map-town-dropdown";
import type { MapCoordinate, MapMetadata, MapTown } from "./types";

type RouteStartMode = "towns" | "coordinates" | "map";

interface MapRouteCreatePanelProps {
  towns: MapTown[];
  bounds: MapMetadata["bounds"];
  onStart: (points: Array<MapCoordinate & { label?: string }>) => void;
  onCancel: () => void;
}

interface CoordinateDraft {
  startX: string;
  startY: string;
  destinationX: string;
  destinationY: string;
}

const EMPTY_COORDINATES: CoordinateDraft = {
  startX: "",
  startY: "",
  destinationX: "",
  destinationY: "",
};

const MapRouteCreatePanel = ({ towns, bounds, onStart, onCancel }: MapRouteCreatePanelProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<RouteStartMode>("towns");
  const [startTownId, setStartTownId] = useState("");
  const [destinationTownId, setDestinationTownId] = useState("");
  const [coordinates, setCoordinates] = useState<CoordinateDraft>(EMPTY_COORDINATES);

  const startTown = towns.find(({ id }) => id === startTownId);
  const destinationTown = towns.find(({ id }) => id === destinationTownId);
  const parsedCoordinates = {
    startX: Number(coordinates.startX),
    startY: Number(coordinates.startY),
    destinationX: Number(coordinates.destinationX),
    destinationY: Number(coordinates.destinationY),
  };
  const coordinateValuesPresent = Object.values(coordinates).every((value) => value.trim() !== "");
  const coordinatesValid = coordinateValuesPresent
    && Object.values(parsedCoordinates).every(Number.isFinite)
    && parsedCoordinates.startX >= bounds.minX
    && parsedCoordinates.startX <= bounds.maxX
    && parsedCoordinates.destinationX >= bounds.minX
    && parsedCoordinates.destinationX <= bounds.maxX
    && parsedCoordinates.startY >= bounds.minY
    && parsedCoordinates.startY <= bounds.maxY
    && parsedCoordinates.destinationY >= bounds.minY
    && parsedCoordinates.destinationY <= bounds.maxY
    && (parsedCoordinates.startX !== parsedCoordinates.destinationX
      || parsedCoordinates.startY !== parsedCoordinates.destinationY);
  const canStart = mode === "map"
    || (mode === "towns" && Boolean(startTown && destinationTown && startTown.id !== destinationTown.id))
    || (mode === "coordinates" && coordinatesValid);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) return;
    if (mode === "map") {
      onStart([]);
      return;
    }
    if (mode === "towns" && startTown && destinationTown) {
      onStart([
        { x: startTown.x, y: startTown.y, label: startTown.name },
        { x: destinationTown.x, y: destinationTown.y, label: destinationTown.name },
      ]);
      return;
    }
    onStart([
      {
        x: parsedCoordinates.startX,
        y: parsedCoordinates.startY,
        label: t("map.route.startCoordinate"),
      },
      {
        x: parsedCoordinates.destinationX,
        y: parsedCoordinates.destinationY,
        label: t("map.route.destinationCoordinate"),
      },
    ]);
  };

  const modes = [
    { id: "towns" as const, label: t("map.route.towns"), icon: MapPinned },
    { id: "coordinates" as const, label: t("map.route.coordinates"), icon: MapPin },
    { id: "map" as const, label: t("map.route.chooseOnMap"), icon: MousePointer2 },
  ];

  const updateCoordinate = (key: keyof CoordinateDraft, value: string) => {
    setCoordinates((current) => ({ ...current, [key]: value }));
  };

  return (
    <form className="map-route-create-panel" onSubmit={submit}>
      <header className="map-route-create-header">
        <span className="min-w-0 flex-1">
          <strong>{t("map.route.createTitle")}</strong>
          <small>{t("map.route.createDescription")}</small>
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("map.route.closeCreatePanel")}
          title={t("map.route.closeCreatePanel")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="map-route-create-modes" role="tablist" aria-label={t("map.route.startMethod")}>
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(mode === id && "map-route-create-mode-active")}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {mode === "towns" && (
        <div className="map-route-create-fields" role="tabpanel">
          <div>
            <span>{t("map.route.startTown")}</span>
            <MapTownDropdown
              towns={towns}
              value={startTownId}
              onSelect={setStartTownId}
              placeholder={t("map.route.selectTown")}
              ariaLabel={t("map.route.startTown")}
              placement="top"
              triggerClassName="h-[35px] bg-surface/90 text-[11px]"
            />
          </div>
          <div>
            <span>{t("map.route.destinationTown")}</span>
            <MapTownDropdown
              towns={towns}
              value={destinationTownId}
              onSelect={setDestinationTownId}
              placeholder={t("map.route.selectTown")}
              ariaLabel={t("map.route.destinationTown")}
              placement="top"
              triggerClassName="h-[35px] bg-surface/90 text-[11px]"
            />
          </div>
        </div>
      )}

      {mode === "coordinates" && (
        <div className="map-route-coordinate-fields" role="tabpanel">
          <fieldset>
            <legend>{t("map.route.startCoordinate")}</legend>
            <label>
              <span>{t("map.route.coordinateX")}</span>
              <input
                type="number"
                min={bounds.minX}
                max={bounds.maxX}
                value={coordinates.startX}
                onChange={(event) => updateCoordinate("startX", event.target.value)}
                aria-label={t("map.route.startX")}
              />
            </label>
            <label>
              <span>{t("map.route.coordinateY")}</span>
              <input
                type="number"
                min={bounds.minY}
                max={bounds.maxY}
                value={coordinates.startY}
                onChange={(event) => updateCoordinate("startY", event.target.value)}
                aria-label={t("map.route.startY")}
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>{t("map.route.destinationCoordinate")}</legend>
            <label>
              <span>{t("map.route.coordinateX")}</span>
              <input
                type="number"
                min={bounds.minX}
                max={bounds.maxX}
                value={coordinates.destinationX}
                onChange={(event) => updateCoordinate("destinationX", event.target.value)}
                aria-label={t("map.route.destinationX")}
              />
            </label>
            <label>
              <span>{t("map.route.coordinateY")}</span>
              <input
                type="number"
                min={bounds.minY}
                max={bounds.maxY}
                value={coordinates.destinationY}
                onChange={(event) => updateCoordinate("destinationY", event.target.value)}
                aria-label={t("map.route.destinationY")}
              />
            </label>
          </fieldset>
          <p>{t("map.route.coordinateBounds", bounds)}</p>
        </div>
      )}

      {mode === "map" && (
        <div className="map-route-map-choice" role="tabpanel">
          <MousePointer2 size={18} aria-hidden="true" />
          <span>
            <strong>{t("map.route.markOnMap")}</strong>
            <small>{t("map.route.markOnMapDescription")}</small>
          </span>
        </div>
      )}

      <button type="submit" disabled={!canStart} className="map-route-begin">
        <Navigation size={15} aria-hidden="true" />
        {mode === "map" ? t("map.route.useMap") : t("map.route.beginRoute")}
      </button>
    </form>
  );
};

export default MapRouteCreatePanel;
