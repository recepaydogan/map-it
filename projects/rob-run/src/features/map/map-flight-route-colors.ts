const FLIGHT_ROUTE_COLORS = [
  "#f2bd56", "#64c8f2", "#f17d9e", "#98d36b", "#ab98ed",
  "#f28e5c", "#55d2c2", "#df83d2", "#d0d75d", "#7e9df2",
  "#ec7373", "#75d7a0", "#c8a37e",
] as const;

export const getFlightRouteColors = (links: readonly { markerId: string }[]) =>
  new Map([...new Set(links.map((link) => link.markerId))]
    .sort((left, right) => left.localeCompare(right))
    .map((id, index) => [id, FLIGHT_ROUTE_COLORS[index]
      ?? `hsl(${Math.round(index * 137.508) % 360} 78% 64%)`]));
