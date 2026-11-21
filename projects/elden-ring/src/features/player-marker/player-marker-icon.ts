import * as L from "leaflet";

const playerIcon = L.divIcon({
  className: "er-player-pin-wrap",
  html: '<div class="er-player-pin"><span class="er-player-pin-core"></span></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  tooltipAnchor: [0, 19],
});

export const buildPlayerIcon = () => playerIcon;
