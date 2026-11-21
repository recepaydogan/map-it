/** Add authored marker-panel status and vendor UI copy to every app locale. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const values = {
  de: [
    "Die Identität der Kreatur ist bestätigt. Vollständige Werte und Beute sind im aktuellen Datenstand nicht verfügbar.",
    "Das Ziel ist bestätigt. Vollständiger Questtext und Belohnungen sind im aktuellen Datenstand nicht verfügbar.",
    "Zum Verkauf ({{count}})",
    "Die Preise gelten pro Kaufmenge und können je nach Ruf variieren. Der Vorrat entspricht dem Datenbankeintrag.",
    "Vorrat: {{count}}", "Keine Verkaufsangebote aufgeführt.", "Preis nicht verfügbar",
    "Das Händlerangebot konnte nicht geladen werden. Öffne dieses Fenster erneut, um es noch einmal zu versuchen.",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × Währung #{{id}}", "{{count}} × Gegenstand #{{id}}",
    "Munitionshändler", "Reagenzienhändler",
  ],
  es: [
    "Se ha verificado la identidad de la criatura. Las estadísticas y el botín completos no están disponibles en los datos actuales.",
    "Se ha verificado el objetivo. El texto completo de la misión y las recompensas no están disponibles en los datos actuales.",
    "En venta ({{count}})",
    "Los precios son por lote de compra y pueden variar según la reputación. Las existencias reflejan la ficha de la base de datos.",
    "Existencias: {{count}}", "No hay artículos a la venta registrados.", "Precio no disponible",
    "No se pudo cargar el inventario del vendedor. Vuelve a abrir este panel para intentarlo de nuevo.",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × moneda n.º {{id}}", "{{count}} × objeto n.º {{id}}",
    "Vendedores de munición", "Vendedores de componentes",
  ],
  fr: [
    "L'identité de la créature est confirmée. Ses caractéristiques complètes et son butin ne sont pas disponibles dans les données actuelles.",
    "L'objectif est confirmé. Le texte intégral de la quête et ses récompenses ne sont pas disponibles dans les données actuelles.",
    "En vente ({{count}})",
    "Les prix s'appliquent à chaque lot acheté et peuvent varier selon la réputation. Le stock correspond aux données répertoriées.",
    "Stock : {{count}}", "Aucun article en vente n'est répertorié.", "Prix indisponible",
    "Impossible de charger l'inventaire du marchand. Rouvrez ce panneau pour réessayer.",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × monnaie n° {{id}}", "{{count}} × objet n° {{id}}",
    "Marchands de munitions", "Marchands de composants",
  ],
  ko: [
    "생물의 신원은 확인되었습니다. 현재 자료에는 전체 능력치와 전리품 정보가 없습니다.",
    "목표는 확인되었습니다. 현재 자료에는 퀘스트 전문과 보상 정보가 없습니다.",
    "판매 품목 ({{count}})",
    "가격은 구매 묶음당 금액이며 평판에 따라 달라질 수 있습니다. 재고는 데이터베이스에 등록된 수량입니다.",
    "재고: {{count}}", "등록된 판매 품목이 없습니다.", "가격 정보 없음",
    "상인 판매 목록을 불러오지 못했습니다. 이 패널을 다시 열어 재시도하세요.",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × 화폐 #{{id}}", "{{count}} × 아이템 #{{id}}",
    "탄약 상인", "마법 재료 상인",
  ],
  "pt-BR": [
    "A identidade da criatura foi confirmada. Os atributos completos e os saques não estão disponíveis nos dados atuais.",
    "O objetivo foi confirmado. O texto completo da missão e as recompensas não estão disponíveis nos dados atuais.",
    "À venda ({{count}})",
    "Os preços são por lote de compra e podem variar conforme a reputação. O estoque reflete o registro no banco de dados.",
    "Estoque: {{count}}", "Não há ofertas de venda registradas.", "Preço indisponível",
    "Não foi possível carregar o inventário do vendedor. Abra este painel novamente para tentar de novo.",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × moeda nº {{id}}", "{{count}} × item nº {{id}}",
    "Vendedores de munição", "Vendedores de reagentes",
  ],
  "zh-Hans": [
    "已确认该生物的身份。当前数据中没有完整的属性和掉落信息。",
    "已确认任务目标。当前数据中没有完整的任务文本和奖励信息。",
    "出售物品（{{count}}）",
    "价格按每组购买数量计算，可能随声望变化。库存以数据库记录为准。",
    "库存：{{count}}", "没有已记录的出售物品。", "暂无价格",
    "无法加载商人商品列表。请重新打开此面板后再试。",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × 货币 #{{id}}", "{{count}} × 物品 #{{id}}",
    "弹药商人", "施法材料商人",
  ],
  "zh-Hant": [
    "已確認該生物的身分。目前資料中沒有完整的屬性和掉落資訊。",
    "已確認任務目標。目前資料中沒有完整的任務文字和獎勵資訊。",
    "販售物品（{{count}}）",
    "價格以每批購買數量計算，可能隨聲望變動。庫存以資料庫記錄為準。",
    "庫存：{{count}}", "沒有已記錄的販售物品。", "暫無價格",
    "無法載入商人商品清單。請重新開啟此面板再試一次。",
    "{{value}}g", "{{value}}s", "{{value}}c", "{{count}} × 貨幣 #{{id}}", "{{count}} × 物品 #{{id}}",
    "彈藥商人", "施法材料商人",
  ],
};
values["es-MX"] = values.es;
const paths = ["rares.partialDetails", "foreverQuest.partialDetails", "vendorInventory.title",
  "vendorInventory.priceNote", "vendorInventory.stock", "vendorInventory.empty",
  "vendorInventory.priceUnknown", "vendorInventory.error", "vendorInventory.gold",
  "vendorInventory.silver", "vendorInventory.copper", "vendorInventory.currency",
  "vendorInventory.itemCost", "categories.ammunitionVendor", "categories.reagentVendor"];
for (const [locale, translated] of Object.entries(values)) {
  const path = join(root, `src/i18n/locales/${locale}.json`);
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text);
  for (const [index, key] of paths.entries()) {
    const [group, field] = key.split(".");
    data.map[group] ??= {};
    if (data.map[group][field] && data.map[group][field] !== translated[index]) {
      throw new Error(`${locale}: existing translation for ${key} differs`);
    }
    data.map[group][field] = translated[index];
  }
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(path, JSON.stringify(data, null, 2).replace(/\n/g, newline) + newline);
  console.log(`${locale}: ${paths.length} panel strings`);
}
