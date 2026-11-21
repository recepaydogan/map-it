/** Reviewed book-location directions. Braced place names resolve from the game client. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const ids = Object.keys(english.map.books.details);
const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const placeKeys = {
  "Sentinel Hill": "AreaTable:108:1", Moonbrook: "AreaTable:20:1",
  "Tower of Azora": "AreaTable:91:1", "Whelgar's Excavation Site": "AreaTable:118:1",
  "Ruins of Mathystra": "AreaTable:443:1", Ratchet: "AreaTable:392:1",
  "Tarren Mill": "AreaTable:272:1", "Light's Hope Chapel": "AreaTable:2268:1",
  Stratholme: "AreaTable:2017:1", Ambermill: "AreaTable:233:1",
  Brill: "AreaTable:159:1", Scholomance: "AreaTable:2057:1",
  Thelsamar: "AreaTable:144:1"
};

// The order follows en.json's book list. A place token is resolved by exact AreaTable/Map text.
const details = {
  de: [
    "{Sentinel Hill}: Im Gasthaus, auf oder hinter dem Tisch des Gastwirts.",
    "{Moonbrook}: In einem Haus, auf dem Bücherregal.",
    "{Tower of Azora}: Auf einem Tisch weiter oben im Turm.",
    "Hall of Explorers: Auf einem Tisch.",
    "Tief in der Ogerhöhle von Mo'Grosh.",
    "{Whelgar's Excavation Site}: In einer großen Urne auf der untersten Ebene. Für eine Route mit zehn Büchern eine Alternative zum Buch aus Mo'Grosh.",
    "{Ruins of Mathystra}: Auf dem dritten Absatz.",
    "Sludge Fen: Ganz oben auf der Ölplattform, im Kontrollraum.",
    "Im Lager der Grimtotem, auf einem Fass in einem Zelt.",
    "{Ratchet}: Im Ingenieursgebäude neben Gazlowe.",
    "{Tarren Mill}: Im Wachturm.",
    "Unter der Erde in einer Gruft.",
    "In einem ausgebrannten Gebäude.",
    "Unter der Erde in der Gruft, nahe dem Seziertisch.",
    "{Light's Hope Chapel}: Im Inneren der Kapelle.",
    "{Stratholme}: Nahe der Brücke vor dem Eingang.",
    "In einem ausgebrannten Haus nahe dem See.",
    "Hinter der Mauer der Trollsiedlung. Auf Stufe 20 schwierig.",
    "In einem Zelt des Dunkeleisenlagers. Ein Gegner in der Nähe erschwert die Suche im Alleingang.",
    "{Ambermill}.",
    "Oben auf dem Tempel.",
    "{Brill}: Beim Alchemiehändler.",
    "{Scholomance}: Im Obergeschoss des Gebäudes.",
    "Im Haus hinter dem Ghul.",
    "Nahe dem Flugpunkt."
  ],
  es: [
    "{Sentinel Hill}: En la posada, sobre la mesa del posadero o detrás de ella.",
    "{Moonbrook}: En una casa, sobre la estantería.",
    "{Tower of Azora}: Sobre una mesa, a media altura de la torre.",
    "Sala de los Exploradores: Sobre una mesa.",
    "En lo profundo de la cueva de ogros de Mo'Grosh.",
    "{Whelgar's Excavation Site}: Dentro de una urna grande en el nivel inferior. Alternativa al libro de Mo'Grosh para una ruta de diez libros.",
    "{Ruins of Mathystra}: En el tercer rellano.",
    "Sludge Fen: En la parte superior de la plataforma petrolífera, dentro de la sala de control.",
    "En el campamento Tótem Siniestro, sobre un barril dentro de una tienda.",
    "{Ratchet}: Dentro del edificio de ingeniería, junto a Gazlowe.",
    "{Tarren Mill}: Dentro de la torre de vigilancia.",
    "Bajo tierra, en una cripta.",
    "Dentro de un edificio incendiado.",
    "Bajo tierra, en la cripta cerca de la mesa de operaciones.",
    "{Light's Hope Chapel}: Dentro de la capilla.",
    "{Stratholme}: Cerca del puente que hay delante de la entrada.",
    "Dentro de una casa incendiada cerca del lago.",
    "Detrás del muro del asentamiento trol. Difícil al nivel 20.",
    "Dentro de una tienda del campamento Hierro Negro. Un enemigo cercano dificulta conseguirlo en solitario.",
    "{Ambermill}.",
    "En lo alto del templo.",
    "{Brill}: Junto al vendedor de alquimia.",
    "{Scholomance}: En la planta superior del edificio.",
    "Dentro de la casa, después del necrófago.",
    "Cerca del punto de vuelo."
  ],
  fr: [
    "{Sentinel Hill} : Dans l'auberge, sur la table de l'aubergiste ou derrière.",
    "{Moonbrook} : Dans une maison, sur la bibliothèque.",
    "{Tower of Azora} : Sur une table à mi-hauteur de la tour.",
    "Hall des explorateurs : Sur une table.",
    "Au fond de la grotte des ogres de Mo'Grosh.",
    "{Whelgar's Excavation Site} : Dans une grande urne au niveau le plus bas. Une alternative au livre de Mo'Grosh pour un parcours de dix livres.",
    "{Ruins of Mathystra} : Sur le troisième palier.",
    "Sludge Fen : En haut de la plateforme pétrolière, dans la salle de contrôle.",
    "Dans le camp des Totems-sinistres, sur un tonneau sous une tente.",
    "{Ratchet} : Dans le bâtiment d'ingénierie à côté de Gazlowe.",
    "{Tarren Mill} : Dans la tour de guet.",
    "Sous terre, dans une crypte.",
    "Dans un bâtiment incendié.",
    "Sous terre, dans la crypte près de la table d'opération.",
    "{Light's Hope Chapel} : À l'intérieur de la chapelle.",
    "{Stratholme} : Près du pont devant l'entrée.",
    "Dans une maison incendiée près du lac.",
    "Derrière le mur du village troll. Difficile au niveau 20.",
    "Dans une tente du camp Sombrefer. Un ennemi proche complique la récupération en solo.",
    "{Ambermill}.",
    "Au sommet du temple.",
    "{Brill} : Près du vendeur d'alchimie.",
    "{Scholomance} : À l'étage du bâtiment.",
    "Dans la maison après la goule.",
    "Près du point de vol."
  ],
  ko: [
    "{Sentinel Hill}: 여관 안, 여관 주인의 탁자 위나 뒤쪽에 있습니다.",
    "{Moonbrook}: 집 안의 책장 위에 있습니다.",
    "{Tower of Azora}: 탑 중간쯤의 탁자 위에 있습니다.",
    "탐험가의 전당: 탁자 위에 있습니다.",
    "Mo'Grosh 오우거 동굴 깊숙한 곳에 있습니다.",
    "{Whelgar's Excavation Site}: 가장 아래층의 큰 항아리 안에 있습니다. 책 열 권을 모으는 경로에서 Mo'Grosh 책 대신 선택할 수 있습니다.",
    "{Ruins of Mathystra}: 세 번째 층계참에 있습니다.",
    "Sludge Fen: 석유 시추 시설 꼭대기의 제어실 안에 있습니다.",
    "그림토템 야영지의 천막 안, 통 위에 있습니다.",
    "{Ratchet}: 가즈로 옆 기계공학 건물 안에 있습니다.",
    "{Tarren Mill}: 감시탑 안에 있습니다.",
    "지하 납골당에 있습니다.",
    "불에 탄 건물 안에 있습니다.",
    "지하 납골당의 수술대 근처에 있습니다.",
    "{Light's Hope Chapel}: 예배당 안에 있습니다.",
    "{Stratholme}: 입구 앞 다리 근처에 있습니다.",
    "호수 근처의 불에 탄 집 안에 있습니다.",
    "트롤 마을의 벽 뒤에 있습니다. 20레벨에는 어렵습니다.",
    "검은무쇠 야영지의 천막 안에 있습니다. 근처의 적 때문에 혼자 얻기 어렵습니다.",
    "{Ambermill}에 있습니다.",
    "사원 꼭대기에 있습니다.",
    "{Brill}: 연금술 상인 옆에 있습니다.",
    "{Scholomance}: 건물 위층에 있습니다.",
    "구울을 지나 집 안에 있습니다.",
    "비행 경로 근처에 있습니다."
  ],
  "pt-BR": [
    "{Sentinel Hill}: Na estalagem, sobre a mesa do estalajadeiro ou atrás dela.",
    "{Moonbrook}: Dentro de uma casa, sobre a estante de livros.",
    "{Tower of Azora}: Sobre uma mesa na metade da subida da torre.",
    "Salão dos Exploradores: Sobre uma mesa.",
    "No fundo da caverna dos ogros de Mo'Grosh.",
    "{Whelgar's Excavation Site}: Dentro de uma urna grande no nível mais baixo. Alternativa ao livro de Mo'Grosh para um percurso de dez livros.",
    "{Ruins of Mathystra}: No terceiro patamar.",
    "Sludge Fen: No alto da plataforma de petróleo, dentro da sala de controle.",
    "No acampamento dos Totens Sinistros, sobre um barril dentro de uma tenda.",
    "{Ratchet}: Dentro do prédio de engenharia ao lado de Gazlowe.",
    "{Tarren Mill}: Dentro da torre de vigia.",
    "No subsolo, dentro de uma cripta.",
    "Dentro de um prédio incendiado.",
    "No subsolo, na cripta perto da mesa de operações.",
    "{Light's Hope Chapel}: Dentro da capela.",
    "{Stratholme}: Perto da ponte em frente à entrada.",
    "Dentro de uma casa incendiada perto do lago.",
    "Atrás do muro do assentamento dos trolls. Difícil no nível 20.",
    "Dentro de uma tenda no acampamento Ferro Negro. Um inimigo próximo dificulta a coleta solo.",
    "{Ambermill}.",
    "No alto do templo.",
    "{Brill}: Ao lado do vendedor de alquimia.",
    "{Scholomance}: No andar de cima do prédio.",
    "Dentro da casa depois do carniçal.",
    "Perto da rota de voo."
  ],
  "zh-Hans": [
    "{Sentinel Hill}：旅店内，旅店老板的桌上或桌后。",
    "{Moonbrook}：一间房屋内的书架上。",
    "{Tower of Azora}：塔楼中段的桌上。",
    "探险者大厅：桌上。",
    "Mo'Grosh 食人魔洞穴深处。",
    "{Whelgar's Excavation Site}：最底层的大型瓮中。收集十本书时，可代替 Mo'Grosh 的那本。",
    "{Ruins of Mathystra}：第三层平台上。",
    "Sludge Fen：钻油平台顶部的控制室内。",
    "恐怖图腾营地的帐篷内，放在木桶上。",
    "{Ratchet}：加兹鲁维旁边的工程学建筑内。",
    "{Tarren Mill}：瞭望塔内。",
    "地下墓穴中。",
    "烧毁的建筑内。",
    "地下墓穴的手术台附近。",
    "{Light's Hope Chapel}：礼拜堂内。",
    "{Stratholme}：入口前的桥附近。",
    "湖边一间烧毁的房屋内。",
    "巨魔聚落的墙后。20 级时较难取得。",
    "黑铁营地的帐篷内。附近的敌人会增加单独获取的难度。",
    "{Ambermill}。",
    "神殿顶部。",
    "{Brill}：炼金术商人旁边。",
    "{Scholomance}：建筑的楼上。",
    "越过食尸鬼后，进入房屋内。",
    "飞行点附近。"
  ],
  "zh-Hant": [
    "{Sentinel Hill}：旅店內，旅店老闆的桌上或桌後。",
    "{Moonbrook}：一間房屋內的書架上。",
    "{Tower of Azora}：塔樓中段的桌上。",
    "探險者大廳：桌上。",
    "Mo'Grosh 食人魔洞穴深處。",
    "{Whelgar's Excavation Site}：最底層的大型甕中。收集十本書時，可代替 Mo'Grosh 的那本。",
    "{Ruins of Mathystra}：第三層平台上。",
    "Sludge Fen：鑽油平台頂部的控制室內。",
    "恐怖圖騰營地的帳篷內，放在木桶上。",
    "{Ratchet}：加茲魯維旁邊的工程學建築內。",
    "{Tarren Mill}：瞭望塔內。",
    "地下墓穴中。",
    "燒毀的建築內。",
    "地下墓穴的手術臺附近。",
    "{Light's Hope Chapel}：禮拜堂內。",
    "{Stratholme}：入口前的橋附近。",
    "湖邊一間燒毀的房屋內。",
    "食人妖聚落的牆後。20 級時較難取得。",
    "黑鐵營地的帳篷內。附近的敵人會增加單獨取得的難度。",
    "{Ambermill}。",
    "神殿頂部。",
    "{Brill}：鍊金術商人旁邊。",
    "{Scholomance}：建築的樓上。",
    "越過食屍鬼後，進入房屋內。",
    "飛行點附近。"
  ]
};
const alternate = {
  de: "{Thelsamar}: Im Gasthaus. Dies ist ein zweiter Fundort desselben Buchs; es zählt nur einmal.",
  es: "{Thelsamar}: En la posada. Es otro lugar donde aparece el mismo libro; solo cuenta una vez.",
  fr: "{Thelsamar} : Dans l'auberge. C'est un autre emplacement du même livre ; il ne compte qu'une fois.",
  ko: "{Thelsamar}: 여관 안에 있습니다. 같은 책의 다른 위치이므로 한 번만 집계됩니다.",
  "pt-BR": "{Thelsamar}: Na estalagem. É outro local do mesmo livro e conta apenas uma vez.",
  "zh-Hans": "{Thelsamar}：旅店内。这是同一本书的另一处位置，只计入一次。",
  "zh-Hant": "{Thelsamar}：旅店內。這是同一本書的另一處位置，只計入一次。"
};

for (const [language, gameLocale] of Object.entries(packs)) {
  const textLanguage = language === "es-MX" ? "es" : language;
  if (details[textLanguage].length !== ids.length) throw new Error(`${language}: expected ${ids.length} book descriptions`);
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const resolve = (text) => text.replace(/\{([^{}]+)\}/g, (_, name) => {
    const index = source.keys.indexOf(placeKeys[name]);
    if (index < 0 || source.values[index] !== name || !pack.values[index])
      throw new Error(`${language}: absent client place ${name}`);
    return pack.values[index];
  });
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  locale.map.books.names = Object.fromEntries(Object.entries(english.map.books.names).map(([id, name]) => {
    const matches = source.keys.flatMap((key, index) =>
      key.startsWith("ItemSparse:") && key.endsWith(":4") && source.values[index] === name
        ? [pack.values[index]] : []);
    if (matches.length !== 1 || !matches[0]) throw new Error(`${language}: book item is absent or ambiguous: ${id}`);
    return [id, matches[0]];
  }));
  locale.map.books.details = Object.fromEntries(ids.map((id, index) => [id, resolve(details[textLanguage][index])]));
  locale.map.books.alternates ??= {};
  locale.map.books.alternates["rumi-of-gnomeregan"] ??= {};
  locale.map.books.alternates["rumi-of-gnomeregan"]["loch-modan"] ??= {};
  const alternateRegionIndex = source.keys.indexOf("AreaTable:38:1");
  if (source.values[alternateRegionIndex] !== "Loch Modan" || !pack.values[alternateRegionIndex])
    throw new Error(`${language}: alternate book region missing from client`);
  locale.map.books.alternates["rumi-of-gnomeregan"]["loch-modan"].region = pack.values[alternateRegionIndex];
  locale.map.books.alternates["rumi-of-gnomeregan"]["loch-modan"].detail = resolve(alternate[textLanguage]);
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: book descriptions are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${ids.length} book locations + alternate`);
}
