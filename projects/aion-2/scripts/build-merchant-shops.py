"""Publish linked NPC shop inventories from decoded client tables."""

import argparse
import json
from pathlib import Path


def rows(directory, table):
    return json.loads((directory / f"{table}.json").read_text("utf-8"))["Properties"]["Data"]


def cell_value(cell):
    return cell["Value"] if isinstance(cell, dict) else cell


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--localization", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, default=Path("public/data/items/catalog.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/merchant-shops.json"))
    args = parser.parse_args()

    strings = json.loads(args.localization.read_text("utf-8"))["Entries"]
    catalog = json.loads(args.catalog.read_text("utf-8"))
    catalog_items = {item["id"]: item for item in catalog["items"]}
    item_rows = {row["Name"]: row for row in rows(args.tables, "Item")}
    item_ids = {name: str(cell_value(row["ID"])) for name, row in item_rows.items()}
    shops = {row["Name"]: row for row in rows(args.tables, "GameShop")}
    tabs = {row["Name"]: row for row in rows(args.tables, "GameShopGoodsList")}
    goods = {row["Name"]: row for row in rows(args.tables, "GameShopGoods")}
    duty_groups = {row["Name"]: row for row in rows(args.tables, "DutyQuestGroup")}
    redraw_costs = {row["Name"]: row for row in rows(args.tables, "DutyQuestRedrawCost")}
    currencies = {row["CurrencyCategory"].split("::")[-1]: strings.get(row["Desc"]["Key"], row["CurrencyCategory"].split("::")[-1])
                  for row in rows(args.tables, "CurrencyInfo")}

    npc_shops = {}
    for npc in rows(args.tables, "NpcData"):
        if npc.get("FunctionType") != "ENpcFuncType::BuySell":
            continue
        values = npc.get("FuncValues", [])
        if not values or values[0] not in shops:
            raise ValueError(f"BuySell NPC has no shop: {npc['Name']}")
        npc_shops[str(cell_value(npc["ID"]))] = {
            "shop": values[0],
            "race": npc["RelationshipEntity"].split("::")[-1].removeprefix("NPC_"),
        }

    published_shops = {}
    for shop_name in sorted({npc["shop"] for npc in npc_shops.values()}):
        shop = shops[shop_name]
        published_tabs = []
        shop_redraw_keys = set()
        for tab_name in shop["GoodsList"]:
            tab = tabs[tab_name]
            items = []
            for goods_name in tab["GoodsList"]:
                offer = goods[goods_name]
                item_id = item_ids[offer["ItemName"]]
                item = catalog_items[item_id]
                item_row = item_rows[offer["ItemName"]]
                redraw_key = None
                if item_row.get("UseEffect") == "EItemUseEffect::GetDutyQuest":
                    group_keys = item_row.get("UseEffectValues", [])
                    if not group_keys or any(key not in duty_groups for key in group_keys):
                        raise ValueError(f"Duty quest item has no group: {offer['ItemName']}")
                    cost_keys = {duty_groups[key]["DutyCost"] for key in group_keys}
                    if len(cost_keys) != 1:
                        raise ValueError(f"Duty quest item has mixed redraw costs: {offer['ItemName']}")
                    redraw_key = cost_keys.pop()
                    if redraw_key not in redraw_costs:
                        raise ValueError(f"Duty quest item has no redraw cost: {offer['ItemName']}")
                    shop_redraw_keys.add(redraw_key)
                levels = [condition["ItemConditionValue"] for condition in offer["ItemConditionList"]
                          if condition["ItemConditionType"] == "EShopConditionType::CharacterLevel"]
                unsupported = [condition for condition in offer["ItemConditionList"]
                               if condition["ItemConditionType"] != "EShopConditionType::CharacterLevel"]
                if unsupported:
                    raise ValueError(f"Unsupported shop condition: {goods_name}")
                items.append({
                    "id": item_id,
                    "name": item["name"],
                    "icon": item.get("icon"),
                    "price": [{"amount": price["ItemPrice"], "currency": price["ItemCurrencyType"].split("::")[-1]}
                              for price in offer["ItemPriceList"]],
                    "level": max(levels) if levels else None,
                    "useLevel": item["usageLevel"],
                    "bundle": offer["ItemBundleCount"],
                    "limit": {
                        "count": offer["ItemLimitCount"],
                        "duration": offer["LimitDurationType"].split("::")[-1],
                        "owner": offer["LimitTargetType"].split("::")[-1],
                    } if offer["bItemIsLimited"] else None,
                })
            published_tabs.append({
                "name": tab["ShopCategoryDesc"]["Key"],
                "race": tab["Race"].split("::")[-1],
                "items": items,
            })
        published_shop = {"tabs": published_tabs}
        if shop_redraw_keys:
            if len(shop_redraw_keys) != 1 or any(
                item_rows[goods[name]["ItemName"]].get("UseEffect") != "EItemUseEffect::GetDutyQuest"
                for tab_name in shop["GoodsList"] for name in tabs[tab_name]["GoodsList"]
            ):
                raise ValueError(f"Shop has mixed duty quest and other offers: {shop_name}")
            redraw = redraw_costs[next(iter(shop_redraw_keys))]
            if len(redraw["CostList"]) != redraw["RedrawMax"]:
                raise ValueError(f"Redraw cost count does not match maximum: {redraw['Name']}")
            published_shop["reroll"] = {
                "costs": [{"amount": cost["Count"], "currency": cost["Item"]} for cost in redraw["CostList"]],
            }
        published_shops[shop_name] = published_shop

    result = {"version": 1, "npcShops": npc_shops, "shops": published_shops, "currencies": currencies}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Published {len(npc_shops)} merchants and {len(published_shops)} shops to {args.output}")


if __name__ == "__main__":
    main()
