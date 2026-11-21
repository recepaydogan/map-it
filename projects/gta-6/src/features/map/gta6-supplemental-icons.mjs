import { getNamedPlaceIconSymbol } from "./gta6-place-icons.mjs";

const typeSymbols = {
  "city-town": "town", bank: "account-balance", fence: "handshake", safe: "diamond",
  "gang-operation": "personal-danger", "gang-compound": "fort", "payday-loan": "account-balance",
  "smash-n-grab": "diamond", atm: "local-atm", "towable-atm": "local-atm", mural: "gallery", "ahol-street-art": "gallery",
  "base-jump": "paragliding", parachuting: "paragliding", "book-swap": "gallery", comics: "print",
  "hidden-package": "package-2", "knife-flight": "flight", magazine: "print",
  "message-bottle": "mail", meteorite: "mountain", "stunt-jump": "jump-across",
  treasure: "diamond", "under-the-bridge": "suspension-bridge", playlist: "sports-score",
  "waink-sculpture": "monument", "collectible-card": "gallery", arcade: "gaming",
  basketball: "sports-basketball", pool: "eight-ball", race: "sports-score",
  "drone-race": "flight", fishing: "anchor", golf: "sports-golf", "mini-golf": "sports-golf",
  gym: "gym", hunting: "deer", meditation: "spa", "car-meet": "directions-car", "shooting-range": "target", garage: "garage",
  safehouse: "home", "bus-stop": "directions-bus", "car-wash": "local-car-wash",
  "ev-charger": "electrical-services", "gas-station": "local-gas-station",
  "vehicle-mod-shop": "car-repair", "pay-n-spray": "car-repair", "public-transport": "train",
  airport: "flight", ferry: "boat", "standout-vehicle": "directions-car",
  "vehicle-rental": "car-rental", "vehicle-request": "directions-car", "vehicle-spawn": "directions-car",
  "ammu-nation": "pistol-gun", "weapon-spawn": "pistol-gun", clothing: "checkroom",
  electronics: "smartphone", "phone-store": "smartphone", footwear: "checkroom", haircut: "content-cut",
  tattoo: "tattoo", bar: "local-bar", "cafe-takeout": "coffee", "convenience-store": "storefront",
  "food-and-drink": "restaurant", "liquor-store": "local-bar", "street-food": "restaurant",
  cinema: "movie", "fire-station": "local-fire-department", hospital: "local-hospital",
  marina: "anchor", nightclub: "nightlife", "police-station": "local-police",
};

// Landmark titles often name the attraction rather than identifying its structure.
const reviewedSymbols = {
  "landmark-009": "anchor",
  "landmark-017": "gallery",
  "landmark-019": "water",
  "landmark-020": "water",
  "landmark-025": "industry",
  "safehouse-004": "hotel",
  "landmark-040": "home",
  "landmark-042": "pets",
  "landmark-043": "pets",
  "convenience-store-004": "local-bar",
  "waink-curiosity-005": "research",
  "waink-curiosity-006": "research",
  "waink-curiosity-007": "location-city",
  "waink-curiosity-009": "road",
  "waink-curiosity-010": "monument",
  "waink-curiosity-011": "observatory",
  "waink-curiosity-014": "home",
  "waink-curiosity-015": "diving",
  "waink-curiosity-016": "park",
  "waink-curiosity-022": "monument",
  "waink-curiosity-023": "monument",
  "waink-curiosity-024": "pets",
  "waink-curiosity-025": "home",
  "waink-curiosity-026": "water",
  "waink-curiosity-027": "water",
  "waink-curiosity-030": "water",
  "waink-curiosity-032": "music",
  "waink-curiosity-033": "sign",
  "waink-curiosity-034": "diving",
  "waink-curiosity-035": "water",
  "waink-curiosity-037": "info",
  "waink-curiosity-038": "smartphone",
  "waink-landmark-002": "monument",
  "waink-landmark-003": "industry",
  "waink-landmark-004": "theater",
  "waink-landmark-005": "observatory",
  "waink-landmark-006": "monument",
  "waink-landmark-009": "location-city",
  "waink-landmark-010": "agriculture",
  "waink-landmark-011": "forest",
  "waink-landmark-012": "agriculture",
  "waink-landmark-014": "ferris-wheel",
  "waink-landmark-016": "ferris-wheel",
  "waink-landmark-020": "monument",
  "waink-landmark-021": "observatory",
  "waink-landmark-027": "observatory",
  "waink-landmark-028": "research",
  "waink-landmark-030": "radar",
  "waink-landmark-031": "blimp",
};

const vehicleSymbol = name => /\b(?:helicopter|maverick)\b/i.test(name) ? "helicopter"
  : /\b(?:airplane|plane|jets?|mammatus|duster|velum)\b/i.test(name) ? "flight"
    : /\b(?:boat|yacht|sungrazer|ripple l20s|pontoon|watercraft)\b/i.test(name) ? "boat" : undefined;

/** Select the place or activity symbol for both new and already published records. */
export function getSupplementalIconSymbol(id, name, category, sourceCategory = id.replace(/-\d+$/, "")) {
  if (!/^[a-z][a-z0-9-]*-\d+$/i.test(id)) return undefined;
  const reviewed = reviewedSymbols[id];
  if (reviewed) return reviewed;
  if (category === "place-card") return "gallery";
  if (category === "place-airport") return sourceCategory === "helipad" ? "helicopter" : "flight";
  if (category === "place-marina") return sourceCategory === "ferry" ? "boat" : "anchor";
  if (category === "place-vehicle") return vehicleSymbol(name) ?? typeSymbols[sourceCategory];
  if (category === "place-landmark" && sourceCategory !== "waink-sculpture") {
    if (/\b(?:wreck|ship|vessel)\b/i.test(name)) return "boat";
    if (/^C0-B8\b/i.test(name)) return "flight";
    if (/\b(?:pond|swamp)\b/i.test(name)) return "water";
    if (/\b(?:crash|wreckage)\b/i.test(name)) return "personal-danger";
    if (/\b(?:home|chalet)\b/i.test(name)) return "home";
    if (/\bvehicles\b/i.test(name)) return "directions-car";
    return getNamedPlaceIconSymbol(name) ?? "monument";
  }
  if (category === "place-event") {
    if (/\b(?:plane|helicopter)\b/i.test(name)) return vehicleSymbol(name) ?? "flight";
    if (/\b(?:bear|deer|alligator|animal)\b/i.test(name)) return "deer";
    if (/\b(?:yacht|boat)\b/i.test(name)) return "boat";
    if (/\b(?:accident|crashout|stuck in the mud)\b/i.test(name)) return "traffic-jam";
    if (/\bmechanic\b/i.test(name)) return "car-repair";
    if (/\b(?:UFO|alien)\b/i.test(name)) return "observatory";
    if (/\b(?:police|cop)\b/i.test(name)) return "local-police";
    if (/\btarget practice\b/i.test(name)) return "target";
    if (/\blivestreaming\b/i.test(name)) return "photo-camera";
    return "personal-danger";
  }
  if (category === "place-retail" || category === "place-repair") {
    const named = getNamedPlaceIconSymbol(name);
    if (named && !["area", "park", "road", "home", "water"].includes(named)) return named;
  }
  return typeSymbols[sourceCategory];
}
