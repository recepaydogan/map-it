import { readFile } from "node:fs/promises";

const data = await (await fetch("https://mapgenie.io/api/v1/maps/1027/data")).json();
const locale = JSON.parse(await readFile("src/i18n/locales/en.json", "utf8"));
const flight = JSON.parse(await readFile("public/maps/world-atlas/locations-flight.json", "utf8")).locations;
const getText = (key) => key.split(".").reduce((value, part) => value?.[part], locale);
const paired = flight.flatMap((point) => {
  const name = getText(point.nameKey);
  const side = getText(point.detailLabelKey);
  const matches = data.locations.filter((location) => location.category_id === 27923
    && location.title === name && location.description?.includes(side));
  return matches.length === 1 ? [{ name, side, point, source: matches[0] }] : [];
});

const fit = (rows, input, output) => {
  const x = rows.map((row) => Number(row.source[input]));
  const y = rows.map((row) => row.point[output]);
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  const slope = x.reduce((sum, value, i) => sum + (value - meanX) * (y[i] - meanY), 0)
    / x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  return { slope, intercept: meanY - slope * meanX };
};

for (const [continent, select] of Object.entries({
  kalimdor: (row) => Number(row.source.longitude) < -0.6,
  easternKingdoms: (row) => Number(row.source.longitude) > -0.6,
})) {
  const rows = paired.filter(select);
  const x = fit(rows, "longitude", "x");
  const y = fit(rows, "latitude", "y");
  const errors = rows.map((row) => ({
    name: row.name,
    error: Math.hypot(row.point.x - (x.slope * Number(row.source.longitude) + x.intercept),
      row.point.y - (y.slope * Number(row.source.latitude) + y.intercept)),
  })).sort((a, b) => b.error - a.error);
  console.log(JSON.stringify({ continent, matches: rows.length, x, y,
    medianError: errors[Math.floor(errors.length / 2)]?.error,
    worst: errors.slice(0, 7) }, null, 2));
}
