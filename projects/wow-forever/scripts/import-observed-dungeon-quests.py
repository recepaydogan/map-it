"""Import dungeon quests whose giver or turn-in was recorded in the beta log."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
from pathlib import Path
import re

from bs4 import BeautifulSoup
import requests


SOURCE = "https://wowforevertalents.com/quests/"
OUTPUT = Path("public/data/dungeons/observed-quests.json")
DUNGEONS = {
    "Ragefire Chasm": "mapgenie-instance-949557",
    "Ruins of Lordaeron": "mapgenie-instance-949838",
    "Deadmines": "mapgenie-instance-949869",
    "Wailing Caverns": "client-instance-poi-1068",
    "Blackfathom Deeps": "mapgenie-instance-949878",
    "Stormwind Stockade": "mapgenie-instance-949875",
    "Razorfen Kraul": "mapgenie-instance-949889",
    "Gnomeregan": "mapgenie-instance-949883",
    "Excavation Site: Wetlands": "mapgenie-instance-949847",
    "Scarlet Monastery": "scarlet-monastery",
    "Razorfen Downs": "mapgenie-instance-949903",
}


def text(tag):
    return tag.get_text(" ", strip=True) if tag else ""


def get_html(url):
    response = requests.get(url, timeout=25)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def item_badge(tag):
    name = text(tag).replace("★", "").strip()
    match = re.search(r"item=(\d+)", tag.get("href", ""))
    if not match:
        return None
    quantity = re.search(r"\s×(\d+)$", name)
    return {"id": match.group(1), "name": re.sub(r"\s×\d+$", "", name),
            **({"quantity": int(quantity.group(1))} if quantity else {})}


def parse_quest(item):
    page = get_html(item["url"])
    content = page.select_one(".qp.is-page")
    source = content.select_one(".qp-src") if content else None
    if not source or "WFT Beta Log addon" not in text(source):
        return None

    header = page.select_one(".qi-head")
    title = text(header.select_one("h1")).replace("★", "").strip()
    byline = text(header.select_one(".qi-by"))
    quest_id = re.search(r"-(\d+)/$", item["url"]).group(1)
    dungeon_name = re.search(r"\(([^()]*)\)$", item["name"]).group(1)
    level = re.search(r"\bLevel\s+(\d+)", byline)
    minimum_level = re.search(r"can be taken from level\s+(\d+)", byline)
    if dungeon_name not in DUNGEONS or not level:
        raise ValueError(f"Unmapped observed dungeon quest: {item['name']}")

    quest = {
        "id": quest_id,
        "dungeonId": DUNGEONS[dungeon_name],
        "title": title,
        "level": int(level.group(1)),
        "objective": text(content.select_one(".qp-summary")),
        "observed": True,
    }
    if minimum_level:
        quest["minimumLevel"] = int(minimum_level.group(1))
    if re.search(r"· Alliance(?: ·|$)", byline):
        quest["faction"] = "Alliance"
    elif re.search(r"· Horde(?: ·|$)", byline):
        quest["faction"] = "Horde"
    objectives = [text(li) for li in content.select(".qp-obj > li")]
    if objectives:
        quest["objectives"] = objectives

    for npc in content.select(".qp-npcs > li"):
        role = text(npc.select_one(".qp-role"))
        target = "giver" if role.startswith("Picked up") else "turnIn" if role.startswith("Turned in") else None
        if target:
            quest[target] = {"name": text(npc.select_one(".qp-npc"))}
            where = text(npc.select_one(".qp-where"))
            if where:
                quest[target]["where"] = where
    if not (quest.get("giver") or quest.get("turnIn")):
        raise ValueError(f"Beta log quest has no NPC: {item['url']}")

    reward_section = False
    reward_label = ""
    for child in content.find_all(recursive=False):
        if child.name == "h2":
            reward_section = text(child) == "Rewards"
            if reward_section:
                quest["rewardChoices"] = []
                quest["rewardItems"] = []
                quest["reputation"] = []
        elif reward_section and "qp-label" in child.get("class", []):
            reward_label = text(child)
        elif reward_section and "qp-items" in child.get("class", []):
            for badge in child.select(".qp-item, .qp-badge"):
                classes = badge.get("class", [])
                if "qp-xp" in classes:
                    match = re.search(r"[\d,]+", text(badge))
                    if match:
                        quest["experience"] = int(match.group().replace(",", ""))
                elif "qp-money" in classes:
                    quest["money"] = text(badge)
                elif "qp-rep" in classes:
                    quest["reputation"].append(text(badge).replace(" · seen on the beta", ""))
                else:
                    item_record = item_badge(badge)
                    if item_record:
                        field = "rewardChoices" if "choose" in reward_label.lower() else "rewardItems"
                        quest[field].append(item_record)
    for field in ("rewardChoices", "rewardItems", "reputation"):
        if not quest.get(field):
            quest.pop(field, None)

    chain = [text(li).replace("★", "").strip() for li in content.select(".qp-chain > li")]
    if chain:
        quest["chain"] = chain
    return quest


index = get_html(SOURCE)
lists = [json.loads(tag.string) for tag in index.select('script[type="application/ld+json"]') if tag.string]
items = next(value["itemListElement"] for value in lists if value.get("@type") == "ItemList")
quests = list(filter(None, ThreadPoolExecutor(max_workers=8).map(parse_quest, items[:124])))
if len(quests) != 46 or len({quest["id"] for quest in quests}) != len(quests):
    raise ValueError(f"Unexpected observed dungeon quest coverage: {len(quests)}")
OUTPUT.write_text(json.dumps({"version": 1, "checkedDate": date.today().isoformat(),
                              "verification": "beta-log", "quests": quests}, ensure_ascii=False, indent=2) + "\n",
                  encoding="utf-8")
print(f"Imported {len(quests)} observed dungeon quests to {OUTPUT}")
