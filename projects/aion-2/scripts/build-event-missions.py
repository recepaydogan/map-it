"""Build a seasonal mission catalog from installed client tables and published map data."""

import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rows(tables, name):
    return read(tables / f"{name}.json")["Properties"]["Data"]


def number(value):
    return value["Value"] if isinstance(value, dict) else value


def calendar_date(ticks):
    return (datetime(1, 1, 1) + timedelta(microseconds=ticks / 10)).date().isoformat()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--tables", required=True, type=Path)
parser.add_argument("--public", default=Path("public"), type=Path)
parser.add_argument("--event-id", required=True, type=int)
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()

event = next(row for row in rows(args.tables, "EventMission") if number(row["ID"]) == args.event_id)
sets = {row["Name"]: row for row in rows(args.tables, "AchievementGroupSet")}
achievements = rows(args.tables, "Achievement")
steps = {number(row["AchievementId"]): row for row in rows(args.tables, "AchievementStep") if row["Step"] == 1}
rewards = {row["AchievementId"]: row for row in rows(args.tables, "AchievementReward") if row["Step"] == 1}
localization = read(args.tables / "L10N-en-US.json")["Entries"]


def faction_missions(faction):
    group_set = sets[event[f"{faction}AchievementGroupSetName"]]
    group_names = set(group_set["GroupList"])
    result = []
    for row in sorted((row for row in achievements if row["GroupName"] in group_names), key=lambda row: number(row["AchievementId"])):
        identity = number(row["AchievementId"])
        step = steps[identity]
        text_key = f"AchievementString_Archieve_{step['AchievementText']}"
        reward = rewards[identity]["ItemRewards"]
        if len(reward) != 1 or row["ResetCycleType"] != "EResetCycleType::Weekly":
            raise ValueError(f"Unexpected event mission reward or reset rule: {identity}")
        result.append({
            "id": identity,
            "title": localization[f"{text_key}_achievement_title"],
            "objective": localization[f"{text_key}_obj_desc"],
            "requiredCount": step["Count"],
            "objectiveType": row["ObjType"].split("::")[-1],
            "rewardCurrency": reward[0]["Item"],
            "rewardAmount": reward[0]["Count"],
        })
    return result


light = faction_missions("Light")
dark = faction_missions("Dark")
if len(light) != len(dark) or not light:
    raise ValueError("Event mission faction sets do not match")
for left, right in zip(light, dark):
    if any(left[key] != right[key] for key in ("title", "objective", "requiredCount", "rewardCurrency", "rewardAmount")):
        raise ValueError(f"Event mission faction variants differ: {left['id']} / {right['id']}")

currency = light[0]["rewardCurrency"]
if any(mission["rewardCurrency"] != currency for mission in light):
    raise ValueError("Event missions have multiple reward currencies")
currency_item = next(row for row in rows(args.tables, "Item") if row["Name"] == currency)
currency_id = str(number(currency_item["ID"]))
catalog_item = next(row for row in read(args.public / "data/items/catalog.json")["items"] if row["id"] == currency_id)
shops = read(args.public / "data/merchant-shops.json")
merchant_ids = {
    npc_id: npc["race"]
    for npc_id, npc in shops["npcShops"].items()
    if any(price["currency"] == currency for tab in shops["shops"][npc["shop"]]["tabs"] for item in tab["items"] for price in item["price"])
}
locations = []
for map_id in ("world-l-a", "world-d-a"):
    metadata = read(args.public / "maps" / map_id / "metadata.json")
    def visit(value):
        if isinstance(value, dict):
            npc_id = str(value.get("entityId", ""))
            if npc_id in merchant_ids and value.get("category") == "event-npc":
                locations.append({"mapId": map_id, "markerId": value["id"], "npcId": npc_id,
                                  "faction": merchant_ids[npc_id], "region": value["region"]})
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(metadata)
if not locations:
    raise ValueError("No map locations found for the event merchants")

catalog = {
    "version": 1,
    "eventId": args.event_id,
    "startDate": calendar_date(event["ActivationStartDate"]["Ticks"]),
    "endDateExclusive": calendar_date(event["ActivationEndDate"]["Ticks"]),
    "reward": {"itemId": currency_id, "name": catalog_item["name"], "icon": catalog_item["icon"]},
    "missions": [
        {"id": str(left["id"]), "achievementIds": {"Light": left["id"], "Dark": right["id"]},
         "title": left["title"], "objective": left["objective"], "requiredCount": left["requiredCount"],
         "objectiveType": left["objectiveType"], "rewardAmount": left["rewardAmount"]}
        for left, right in zip(light, dark)
    ],
    "merchantLocations": sorted(locations, key=lambda location: (location["faction"], location["region"])),
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(catalog['missions'])} missions and {len(locations)} merchant locations to {args.output}")
