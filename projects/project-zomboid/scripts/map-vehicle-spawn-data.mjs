import { parseMapObjects } from "./map-objects-parser.mjs";

const TRAFFIC_JAM_TYPE = "trafficjam";

const TYPE_ALIASES = {
  burnt: "normalburnt",
  spiffos: "spiffo",
};

const TYPE_LABELS = {
  parkingstall: "General parking",
  bad: "Lower-quality vehicles",
  medium: "Standard vehicles",
  good: "High-quality vehicles",
  luxurydealership: "Luxury dealership",
  sport: "Sports cars",
  junkyard: "Junkyard vehicles",
  normalburnt: "Burnt vehicles",
  specialburnt: "Special burnt vehicles",
  trafficjam: "Traffic jam",
  police: "Police vehicles",
  prison: "Prison vehicles",
  fire: "Fire department vehicles",
  ranger: "Ranger vehicles",
  ambulance: "Ambulances",
  army: "Military vehicles",
  mccoy: "McCoy Logging vehicles",
  carpenter: "Carpenter vehicles",
  postal: "Postal vehicles",
  spiffo: "Spiffo vehicles",
  radio: "Radio vehicles",
  fossoil: "Fossoil vehicles",
  scarlet: "Scarlet Oak vehicles",
  massgenfac: "Mass-Genfac vehicles",
  transit: "Transit vehicles",
  network3: "Network 3 vehicles",
  kyheralds: "Kentucky Herald vehicles",
  lectromax: "Lectro-Max vehicles",
  knoxdisti: "Knox Distillery vehicles",
  advertising: "Advertising trailers",
  airportshuttle: "Airport shuttles",
  airportservice: "Airport service vehicles",
  farm: "Farm vehicles and trailers",
  trailerpark: "Trailer park vehicles",
  racecar: "Race cars",
  shitmobile: "Unique wreck",
};

const getCategory = (type) => {
  if (type === TRAFFIC_JAM_TYPE) return "traffic";
  if (["junkyard", "normalburnt", "specialburnt", "shitmobile"].includes(type)) return "wreck";
  if (["police", "prison", "fire", "ranger", "ambulance", "army"].includes(type)) return "emergency";
  if (["good", "luxurydealership", "sport", "racecar"].includes(type)) return "performance";
  if (["farm", "trailerpark"].includes(type)) return "rural";
  if (["bad", "medium", "parkingstall"].includes(type)) return "standard";
  return "service";
};

const humanizeIdentifier = (value) => value
  .replace(/^Base\./, "")
  .replace(/[_-]+/g, " ")
  .replace(/([a-z\d])([A-Z])/g, "$1 $2")
  .replace(/\b\w/g, (character) => character.toUpperCase());

const normalizeType = (rawType) => {
  const lowercase = rawType.toLowerCase();
  if (/^r?trafficjam/.test(lowercase)) return TRAFFIC_JAM_TYPE;
  if (/^racecar\d+$/.test(lowercase)) return "racecar";
  return TYPE_ALIASES[lowercase] ?? lowercase;
};

const getVehicleName = (vehicleId, translations) => {
  const scriptName = vehicleId.replace(/^Base\./, "");
  const direct = translations[`IGUI_VehicleName${scriptName}`];
  if (direct) return direct;
  const unburnt = scriptName.replace(/Burnt/g, "");
  return translations[`IGUI_VehicleName${unburnt}`] ?? humanizeIdentifier(scriptName);
};

const parseVehicleList = (source, ownerPattern, translations) => {
  const vehicles = [];
  const vehiclePattern = new RegExp(`${ownerPattern}\\["([^"]+)"\\]\\s*=\\s*\\{[^}]*spawnChance\\s*=\\s*(\\d+(?:\\.\\d+)?)`, "g");
  let match;
  while ((match = vehiclePattern.exec(source)) !== null) {
    vehicles.push({
      id: match[1],
      name: getVehicleName(match[1], translations),
      spawnChance: Number(match[2]),
    });
  }
  return vehicles.sort((left, right) => right.spawnChance - left.spawnChance).slice(0, 6);
};

const parseNumberProperty = (source, type, property) => {
  const match = source.match(new RegExp(`VehicleZoneDistribution\\.${type}\\.${property}\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : undefined;
};

const parseDistributionDefinitions = (source, translations) => {
  const definitions = new Map();
  const definitionPattern = /VehicleZoneDistribution\.([A-Za-z0-9_]+)\s*=\s*\{\};/g;
  const matches = [...source.matchAll(definitionPattern)];
  const trafficJamVehicles = parseVehicleList(source, "trafficjamVehicles", translations);

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const type = match[1];
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    const section = source.slice(start, end);
    const usesTrafficJamVehicles = section.includes("vehicles = trafficjamVehicles");
    definitions.set(type.toLowerCase(), {
      vehicles: usesTrafficJamVehicles
        ? trafficJamVehicles
        : parseVehicleList(section, `VehicleZoneDistribution\\.${type}\\.vehicles`, translations),
      baseVehicleQuality: parseNumberProperty(section, type, "baseVehicleQuality"),
      spawnRate: parseNumberProperty(section, type, "spawnRate"),
      chanceToSpawnBurnt: parseNumberProperty(section, type, "chanceToSpawnBurnt"),
      chanceToPartDamage: parseNumberProperty(section, type, "chanceToPartDamage"),
      chanceToSpawnKey: parseNumberProperty(section, type, "chanceToSpawnKey"),
    });
  }

  const trafficDefinition = definitions.get("trafficjamw");
  if (trafficDefinition) definitions.set(TRAFFIC_JAM_TYPE, trafficDefinition);
  return definitions;
};

export const buildMapVehicleSpawnData = (objectsSource, distributionsSource, translations) => {
  const parsedDefinitions = parseDistributionDefinitions(distributionsSource, translations);
  const rawZones = parseMapObjects(objectsSource)
    .filter(({ type, name, z }) => type === "ParkingStall" && name && z === 0)
    .map((zone) => ({ ...zone, normalizedType: normalizeType(zone.name) }));
  const typeIds = [...new Set(rawZones.map(({ normalizedType }) => normalizedType))].sort();
  const typeIndex = new Map(typeIds.map((type, index) => [type, index]));
  const definitions = typeIds.map((type) => ({
    id: type,
    label: TYPE_LABELS[type] ?? humanizeIdentifier(type),
    category: getCategory(type),
    ...(parsedDefinitions.get(type) ?? { vehicles: [] }),
  }));
  const zones = rawZones.map(({ normalizedType, x, y, width, height }) => [
    typeIndex.get(normalizedType),
    x,
    y,
    width,
    height,
  ]);

  return { definitions, zones, totalZones: zones.length };
};
