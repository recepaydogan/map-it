/** Translate map travel labels and use client area names wherever available. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const phrases = {
  de: { sign: "Wegweiser:", Zeppelin: "Zeppelin:", Boat: "Schiff:", Tram: "Straßenbahn:" },
  es: { sign: "Señal hacia", Zeppelin: "Zepelín a", Boat: "Barco a", Tram: "Tranvía a" },
  "es-MX": { sign: "Señal hacia", Zeppelin: "Zepelín a", Boat: "Barco a", Tram: "Tranvía a" },
  fr: { sign: "Panneau vers", Zeppelin: "Zeppelin vers", Boat: "Bateau vers", Tram: "Tram vers" },
  ko: { sign: "방향 표지판:", Zeppelin: "비행선:", Boat: "배:", Tram: "지하철:" },
  "pt-BR": { sign: "Placa para", Zeppelin: "Zepelim para", Boat: "Barco para", Tram: "Bonde para" },
  "zh-Hans": { sign: "路牌：前往", Zeppelin: "飞艇：前往", Boat: "船只：前往", Tram: "地铁：前往" },
  "zh-Hant": { sign: "路牌：前往", Zeppelin: "飛艇：前往", Boat: "船隻：前往", Tram: "地鐵：前往" },
};
const stopText = {
  de: ["Weitere Haltestellen dieser Route", "Wegweiser in der Nähe", "Verbindungen in der Nähe", "Verfügbarkeit und Abfahrtszeiten sind unbekannt.", "über", "oder", "Küste", "Dungeon", "Schlachtzug"],
  es: ["Otras paradas de esta ruta", "Señal cercana", "Rutas de transporte cercanas", "Se desconocen la disponibilidad del servicio y los horarios de salida.", "vía", "o", "costa", "Mazmorra", "Banda"],
  "es-MX": ["Otras paradas de esta ruta", "Señal cercana", "Rutas de transporte cercanas", "Se desconocen la disponibilidad del servicio y los horarios de salida.", "vía", "o", "costa", "Mazmorra", "Banda"],
  fr: ["Autres arrêts de cet itinéraire", "Panneau à proximité", "Liaisons à proximité", "La disponibilité du service et les heures de départ sont inconnues.", "via", "ou", "côte", "Donjon", "Raid"],
  ko: ["이 경로의 다른 정류장", "근처 표지판", "근처 교통 노선", "운행 여부와 출발 시간은 확인되지 않았습니다.", "경유", "또는", "해안", "던전", "공격대"],
  "pt-BR": ["Outras paradas desta rota", "Placa próxima", "Rotas de transporte próximas", "A disponibilidade do serviço e os horários de partida são desconhecidos.", "via", "ou", "litoral", "Masmorra", "Raide"],
  "zh-Hans": ["此路线的其他站点", "附近的路牌", "附近的交通路线", "服务是否开放及出发时间尚不清楚。", "途经", "或", "海岸", "地下城", "团队副本"],
  "zh-Hant": ["此路線的其他站點", "附近的路牌", "附近的交通路線", "服務是否開放及出發時間尚不清楚。", "途經", "或", "海岸", "地城", "團隊副本"],
};
const signText = {
  de: { nearbyPlace: "Ort in der Nähe", postedDestination: "Ort auf dem Schild", roundTrip: "Hin- und Rückfahrten: ", landingTower: "Schild am Zeppelin-Landeturm", landing: "Schild am Zeppelin-Landeplatz", landingDescription: "Schild am Zeppelin-Landeplatz.", boatSigns: "Bootsschilder", points: "Schilder weisen auf: ", nearbyTown: "Ort in der Nähe", postedDestinations: "Orte auf den Schildern", namedPlace: "Ort auf dem Schild", directional: "Wegweiser", directionalPlural: "Wegweiser", signedPlaces: "Zeigt in Richtung", bank: "Bank", bankSign: "Bankschild.", goodsName: "Handelswaren und Vorräte", goodsSign: "Gemischtwarenschild. Händler und Sortiment nicht bestätigt.", tradeSign: "Handelswarenschild. Händler und Sortiment nicht bestätigt.", repairTent: "Zelt von Rugged Repairs", repairSign: "Reparaturzelt." },
  es: { nearbyPlace: "Lugar cercano", postedDestination: "Lugar indicado en la señal", roundTrip: "Viajes de ida y vuelta: ", landingTower: "Señal de la torre de aterrizaje de zepelines", landing: "Señal del aterrizaje de zepelines", landingDescription: "Señal del aterrizaje de zepelines.", boatSigns: "Señales de barcos", points: "Las señales indican: ", nearbyTown: "Población cercana", postedDestinations: "Lugares indicados en las señales", namedPlace: "Lugar indicado en la señal", directional: "Señal de dirección", directionalPlural: "Señales de dirección", signedPlaces: "Indica el camino hacia", bank: "Banco", bankSign: "Señal del banco.", goodsName: "Mercancías y suministros", goodsSign: "Señal de productos generales. No se han confirmado el vendedor ni sus existencias.", tradeSign: "Señal de mercancías. No se han confirmado el vendedor ni sus existencias.", repairTent: "Tienda de Rugged Repairs", repairSign: "Tienda de reparaciones." },
  "es-MX": { nearbyPlace: "Lugar cercano", postedDestination: "Lugar indicado en la señal", roundTrip: "Viajes de ida y vuelta: ", landingTower: "Señal de la torre de aterrizaje de zepelines", landing: "Señal del aterrizaje de zepelines", landingDescription: "Señal del aterrizaje de zepelines.", boatSigns: "Señales de barcos", points: "Las señales indican: ", nearbyTown: "Población cercana", postedDestinations: "Lugares indicados en las señales", namedPlace: "Lugar indicado en la señal", directional: "Señal de dirección", directionalPlural: "Señales de dirección", signedPlaces: "Indica el camino hacia", bank: "Banco", bankSign: "Señal del banco.", goodsName: "Mercancías y suministros", goodsSign: "Señal de productos generales. No se han confirmado el vendedor ni sus existencias.", tradeSign: "Señal de mercancías. No se han confirmado el vendedor ni sus existencias.", repairTent: "Tienda de Rugged Repairs", repairSign: "Tienda de reparaciones." },
  fr: { nearbyPlace: "Lieu à proximité", postedDestination: "Lieu indiqué sur le panneau", roundTrip: "Allers-retours : ", landingTower: "Panneau de la tour d'atterrissage des zeppelins", landing: "Panneau d'atterrissage des zeppelins", landingDescription: "Panneau d'atterrissage des zeppelins.", boatSigns: "Panneaux des bateaux", points: "Les panneaux indiquent : ", nearbyTown: "Ville à proximité", postedDestinations: "Lieux indiqués sur les panneaux", namedPlace: "Lieu indiqué sur le panneau", directional: "Panneau directionnel", directionalPlural: "Panneaux directionnels", signedPlaces: "Indique la direction de", bank: "Banque", bankSign: "Panneau de la banque.", goodsName: "Marchandises et fournitures", goodsSign: "Panneau de marchandises générales. Marchand et stock non confirmés.", tradeSign: "Panneau de marchandises. Marchand et stock non confirmés.", repairTent: "Tente de Rugged Repairs", repairSign: "Tente de réparation." },
  ko: { nearbyPlace: "근처 장소", postedDestination: "표지판에 적힌 목적지", roundTrip: "왕복 노선: ", landingTower: "비행선 착륙 탑 표지판", landing: "비행선 착륙장 표지판", landingDescription: "비행선 착륙장 표지판입니다.", boatSigns: "배편 표지판", points: "표지판의 목적지: ", nearbyTown: "근처 마을", postedDestinations: "표지판에 적힌 목적지", namedPlace: "표지판에 적힌 장소", directional: "방향 표지판", directionalPlural: "방향 표지판", signedPlaces: "가리키는 곳", bank: "은행", bankSign: "은행 표지판입니다.", goodsName: "교역품 및 보급품", goodsSign: "잡화점 표지판입니다. 상인과 판매 물품은 확인되지 않았습니다.", tradeSign: "교역품 표지판입니다. 상인과 판매 물품은 확인되지 않았습니다.", repairTent: "Rugged Repairs 수리 천막", repairSign: "수리 천막입니다." },
  "pt-BR": { nearbyPlace: "Local próximo", postedDestination: "Local indicado na placa", roundTrip: "Viagens de ida e volta: ", landingTower: "Placa da torre de pouso de zepelins", landing: "Placa de pouso de zepelins", landingDescription: "Placa de pouso de zepelins.", boatSigns: "Placas dos barcos", points: "As placas apontam para: ", nearbyTown: "Cidade próxima", postedDestinations: "Lugares indicados nas placas", namedPlace: "Lugar indicado na placa", directional: "Placa de direção", directionalPlural: "Placas de direção", signedPlaces: "Aponta para", bank: "Banco", bankSign: "Placa do banco.", goodsName: "Mercadorias e suprimentos", goodsSign: "Placa de mercadorias gerais. Vendedor e estoque não confirmados.", tradeSign: "Placa de mercadorias. Vendedor e estoque não confirmados.", repairTent: "Tenda da Rugged Repairs", repairSign: "Tenda de reparos." },
  "zh-Hans": { nearbyPlace: "附近地点", postedDestination: "路牌上的目的地", roundTrip: "往返路线：", landingTower: "飞艇着陆塔路牌", landing: "飞艇着陆点路牌", landingDescription: "飞艇着陆点的路牌。", boatSigns: "船只路牌", points: "路牌指向：", nearbyTown: "附近城镇", postedDestinations: "路牌上的地点", namedPlace: "路牌上的地点", directional: "方向路牌", directionalPlural: "方向路牌", signedPlaces: "指向", bank: "银行", bankSign: "银行路牌。", goodsName: "贸易货物和补给品", goodsSign: "杂货路牌。商人和库存尚未确认。", tradeSign: "贸易货物路牌。商人和库存尚未确认。", repairTent: "Rugged Repairs 修理帐篷", repairSign: "修理帐篷。" },
  "zh-Hant": { nearbyPlace: "附近地點", postedDestination: "路牌上的目的地", roundTrip: "往返路線：", landingTower: "飛艇著陸塔路牌", landing: "飛艇著陸點路牌", landingDescription: "飛艇著陸點的路牌。", boatSigns: "船隻路牌", points: "路牌指向：", nearbyTown: "附近城鎮", postedDestinations: "路牌上的地點", namedPlace: "路牌上的地點", directional: "方向路牌", directionalPlural: "方向路牌", signedPlaces: "指向", bank: "銀行", bankSign: "銀行路牌。", goodsName: "貿易貨物和補給品", goodsSign: "雜貨路牌。商人和庫存尚未確認。", tradeSign: "貿易貨物路牌。商人和庫存尚未確認。", repairTent: "Rugged Repairs 修理帳篷", repairSign: "修理帳篷。" }
};
const bankText = {
  de: ["West", "Ost", "Handelsviertel", "Zwergenviertel", "Tresor", "Gildentresor"],
  es: ["Oeste", "Este", "Distrito Comercial", "Distrito de los Enanos", "Cámara", "Depósito del gremio"],
  "es-MX": ["Oeste", "Este", "Distrito Comercial", "Distrito de los Enanos", "Cámara", "Depósito del gremio"],
  fr: ["Ouest", "Est", "Quartier commerçant", "Quartier des nains", "Coffre", "Coffre de guilde"],
  ko: ["서쪽", "동쪽", "상업 지구", "드워프 지구", "금고", "길드 금고"],
  "pt-BR": ["Oeste", "Leste", "Distrito Comercial", "Distrito dos Anões", "Cofre", "Cofre da guilda"],
  "zh-Hans": ["西侧", "东侧", "贸易区", "矮人区", "宝库", "公会仓库"],
  "zh-Hant": ["西側", "東側", "貿易區", "矮人區", "寶庫", "公會倉庫"]
};
const instanceClientKeys = {
  948715: "AreaPOI:1013:0",
  949855: "WMOAreaTable:144590:0", 949860: "WMOAreaTable:137677:0",
  948718: "AreaTable:1977:1", 949557: "AreaTable:2437:1",
  949820: "LFGDungeons:3273:0", 949838: "AreaTable:153:1",
  949849: "AreaTable:16544:1", 949851: "AreaTable:1216:1",
  949858: "AreaTable:17780:1", 949862: "AreaTable:16985:1",
  949869: "AreaTable:1581:1", 949872: "AreaTable:209:1",
  949875: "AreaTable:717:1", 949878: "AreaTable:719:1",
  949883: "AreaTable:721:1", 949889: "AreaTable:491:1",
  949903: "AreaTable:722:1", 949909: "AreaTable:978:1",
  949916: "AreaTable:1584:1", 949919: "AreaTable:1583:1",
  949922: "AreaTable:2017:1", 949923: "AreaTable:2557:1"
};
const flightAliases = {
  Elwynn: "Elwynn Forest", Redridge: "Redridge Mountains",
  Tirisfal: "Tirisfal Glades", Hillsbrad: "Hillsbrad Foothills",
  Arathi: "Arathi Highlands", Stranglethorn: "Stranglethorn Vale",
  Crossroads: "The Crossroads", Feathermoon: "Feathermoon Stronghold",
  "The Undercity": "Undercity", Stormwind: "Stormwind City",
  Menethil: "Menethil Harbor",
  "Menethil Harbour": "Menethil Harbor", "Grom'gol": "Grom'gol Base Camp",
  Theramore: "Theramore Isle"
};

for (const [language, gameLocale] of Object.entries(packs)) {
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  const dictionaries = [new Map(), new Map(), new Map()];
  source.keys.forEach((key, index) => {
    const dictionary = key.startsWith("AreaTable:") && key.endsWith(":1") ? dictionaries[0]
      : key.startsWith("AreaTable:") && key.endsWith(":0") ? dictionaries[1]
        : key.startsWith("Map:") && key.endsWith(":1") ? dictionaries[2] : undefined;
    if (!dictionary || !source.values[index] || !pack.values[index]) return;
    const options = dictionary.get(source.values[index]) ?? new Set();
    options.add(pack.values[index]);
    dictionary.set(source.values[index], options);
  });
  const place = (name) => {
    if (name === "Feralas coast") return `${place("Feralas")} (${stopText[language][6]})`;
    const fullName = flightAliases[name] ?? name;
    for (const dictionary of dictionaries) {
      const options = dictionary.get(fullName);
      if (options?.size === 1) return [...options][0];
    }
    return name;
  };
  const separator = language.startsWith("zh") ? "" : " ";
  const phrase = (verb, name) => `${verb}${separator}${place(name)}`;
  locale.map.worldSignposts ??= {};
  for (const [id, value] of Object.entries(english.map.worldSignposts)) {
    const match = /^Sign to (.+?)( \+\d+)?$/.exec(value);
    if (!match) throw new Error(`Unknown signpost label: ${id}/${value}`);
    locale.map.worldSignposts[id] = phrase(phrases[language].sign, match[1]) + (match[2] ?? "");
  }
  locale.map.mapgenieTransport ??= {};
  for (const [id, record] of Object.entries(english.map.mapgenieTransport)) {
    const match = /^(Zeppelin|Boat|Tram) to (.+)$/.exec(record.name);
    if (!match) throw new Error(`Unknown transport label: ${id}/${record.name}`);
    const translated = locale.map.mapgenieTransport[id] ??= {};
    translated.name = phrase(phrases[language][match[1]], match[2]);
    translated.destination = place(record.destination);
  }
  for (const [group, field] of [["transportStops", "places"], ["books", "regions"], ["questNpcs", "regions"]]) {
    locale.map[group] ??= {};
    locale.map[group][field] ??= {};
    for (const [id, value] of Object.entries(english.map[group][field])) {
      const localized = value.split(", ").map(place).join(", ");
      if (localized !== value) locale.map[group][field][id] = localized;
    }
  }
  const [routeStops, nearbySign, nearbyRoutes, availability, via, or, coast, dungeon, raid] = stopText[language];
  Object.assign(locale.map.transportStops, { routeStops, nearbySign, nearbyRoutes, availability });
  const routePlace = (name) => name === "Feralas coast" ? `${place("Feralas")} (${coast})` : place(name);
  locale.map.publishedFlightPoints ??= {};
  for (const [id, value] of Object.entries(english.map.publishedFlightPoints)) {
    const index = source.keys.indexOf(`TaxiNodes:${id}:0`);
    if (index < 0 || source.values[index] !== value || !pack.values[index]) {
      throw new Error(`${language}: flight point ${id} does not match the client TaxiNodes label`);
    }
    locale.map.publishedFlightPoints[id] = pack.values[index];
  }
  locale.map.transportStops.names ??= {};
  for (const [routeId, stops] of Object.entries(english.map.transportStops.names)) {
    locale.map.transportStops.names[routeId] ??= {};
    for (const [stopId, label] of Object.entries(stops)) {
      const match = /^(Zeppelin|Boat|Tram) to (.+?)(?: via (.+)| or (.+))?$/.exec(label);
      if (!match) throw new Error(`Unknown route label: ${routeId}/${stopId}/${label}`);
      const main = `${phrases[language][match[1]]}${separator}${routePlace(match[2])}`;
      const connector = language.startsWith("zh") ? "" : " ";
      locale.map.transportStops.names[routeId][stopId] = match[3]
        ? `${main} (${via}${connector}${routePlace(match[3])})`
        : match[4] ? `${main}${connector}${or}${connector}${routePlace(match[4])}` : main;
    }
  }
  locale.map.instanceCoverage ??= {};
  locale.map.instanceCoverage.dungeon = dungeon;
  locale.map.instanceCoverage.raid = raid;
  locale.map.instanceCoverage.names ??= {};
  for (const [id, key] of Object.entries(instanceClientKeys)) {
    const index = source.keys.indexOf(key);
    if (source.values[index] !== english.map.instanceCoverage.names[id] || !pack.values[index])
      throw new Error(`${language}: instance ${id} does not match ${key}`);
    locale.map.instanceCoverage.names[id] = pack.values[index];
  }
  const sign = signText[language];
  const destinations = (value) => value.split(/, | and /).map(place)
    .join(language.startsWith("zh") ? "、" : ", ");
  const pointList = (value) => {
    const match = /^(?:Signs point to|Points toward) (.+)\.$/.exec(value);
    if (!match) throw new Error(`${language}: unknown sign directions: ${value}`);
    return sign.points + destinations(match[1]);
  };
  locale.map.transportSigns ??= {};
  locale.map.transportSigns.nearbyPlace = sign.nearbyPlace;
  locale.map.transportSigns.postedDestination = sign.postedDestination;
  locale.map.transportSigns[165549] = {
    name: `Maiden's Fancy — ${phrase(phrases[language].sign, "Booty Bay")}`,
    description: sign.roundTrip + place("Booty Bay")
  };
  for (const [id, name] of [[165557, sign.landingTower], [165558, sign.landing]]) {
    locale.map.transportSigns[id] = { name, description: sign.landingDescription };
  }
  locale.map.boatSigns = {
    nearbyTown: sign.nearbyTown, postedDestinations: sign.postedDestinations,
    auberdine: { name: `${place("Auberdine")} · ${sign.boatSigns}`,
      description: pointList(english.map.boatSigns.auberdine.description) },
    menethilHarbor: { name: `${place("Menethil Harbor")} · ${sign.boatSigns}`,
      description: pointList(english.map.boatSigns.menethilHarbor.description) }
  };
  locale.map.wayfinding = {
    namedPlace: sign.namedPlace,
    shadyRestInn: place("Shady Rest Inn"),
    shadyRestInnSign: phrase(phrases[language].sign, "Shady Rest Inn"),
    steamwheedlePort: place("Steamwheedle Port"),
    steamwheedlePortSign: phrase(phrases[language].sign, "Steamwheedle Port")
  };
  locale.map.directionalSigns = {
    name: sign.directional, filter: sign.directionalPlural,
    signedPlaces: sign.signedPlaces,
    demonFallCanyon: pointList(english.map.directionalSigns.demonFallCanyon)
  };
  locale.map.hyjalSigns = Object.fromEntries(Object.entries(english.map.hyjalSigns)
    .map(([id, record]) => [id, { description: pointList(record.description) }]));
  const kurukIndex = source.keys.indexOf("GameObjects:148424:0");
  if (kurukIndex < 0 || source.values[kurukIndex] !== english.map.shopSigns.kuruksGoods.name ||
    !pack.values[kurukIndex]) throw new Error(`${language}: Kuruk's Goods sign is missing from the client`);
  locale.map.shopSigns = {
    kuruksGoods: { name: pack.values[kurukIndex], description: sign.goodsSign },
    tradeGoods: { name: sign.goodsName, description: sign.tradeSign }
  };
  locale.map.bankSigns = {
    thunderBluffBank: { name: `${place("Thunder Bluff")} · ${sign.bank}`,
      description: sign.bankSign }
  };
  locale.map.repairSites = { west: sign.repairTent, east: sign.repairTent,
    description: sign.repairSign };
  const [west, east, tradeDistrict, dwarvenDistrict, vault, guildVault] = bankText[language];
  const bank = (name, qualifier) => [place(name), sign.bank, qualifier].filter(Boolean).join(" · ");
  locale.map.banks = {
    powderfusePort: bank("Powderfuse Port"), gadgetzan: bank("Gadgetzan"),
    dalaranWest: bank("Dalaran", west), dalaranEast: bank("Dalaran", east),
    bootyBay: bank("Booty Bay"), ironforge: `${place("Ironforge")} · ${vault}`,
    stormwindTrade: bank("Stormwind", tradeDistrict),
    stormwindDwarven: bank("Stormwind", dwarvenDistrict),
    ratchet: bank("Ratchet"), orgrimmar: bank("Orgrimmar")
  };
  locale.map.bankRegions = Object.fromEntries(Object.entries(english.map.bankRegions)
    .map(([id, name]) => [id, place(name)]));
  locale.map.dalaranVenues = { region: place("City of Dalaran") };
  locale.map.supplementalLocations = Object.fromEntries(Object.entries(english.map.supplementalLocations)
    .map(([id, record]) => [id, { name: record.name === "Guild Vault" ? guildVault : place(record.name) }]));
  locale.map.instanceMaps ??= {};
  for (const id of ["scholomance", "demonFallCanyon", "razorfenKraul"])
    locale.map.instanceMaps[id] = place(english.map.instanceMaps[id]);
  for (const group of ["battlegroundMaps", "publishedGraveyards", "publishedWorldObjectives"]) {
    locale.map[group] ??= {};
    for (const [id, name] of Object.entries(english.map[group])) {
      if (group === "publishedWorldObjectives") {
        const index = source.keys.indexOf(`AreaPOI:${id}:0`);
        if (index < 0 || source.values[index] !== name || !pack.values[index]) {
          throw new Error(`${language}: world objective ${id} does not match the client AreaPOI`);
        }
        locale.map[group][id] = pack.values[index];
        continue;
      }
      const translated = place(name);
      if (translated !== name) locale.map[group][id] = translated;
    }
  }
  locale.map.publishedPlaces ??= {};
  for (const [id, record] of Object.entries(english.map.publishedPlaces)) {
    locale.map.publishedPlaces[id] = { name: place(record.name), region: place(record.region) };
  }
  locale.map.publishedInstances ??= {};
  for (const [id, record] of Object.entries(english.map.publishedInstances)) {
    locale.map.publishedInstances[id] ??= {};
    for (const field of ["name", "region"]) if (record[field])
      locale.map.publishedInstances[id][field] = place(record[field]);
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: map travel text is stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${Object.keys(english.map.worldSignposts).length} signs, ${Object.keys(english.map.mapgenieTransport).length} transport points`);
}
