"""Apply reviewed post-publication differences, without touching translation overlays."""
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "data/site-research/wowhead-audit-2026-11-02"
POST = AUDIT / "post-publication"
changed = []

def read(path): return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))
def write(path, value):
    target = ROOT / path
    if read(path) == value: return
    target.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    changed.append(str(path))

reviewed = read(POST / "reviewed-differences.json")
diffs = reviewed["names"]
item_names = {str(r["id"]): r for r in diffs if r["kind"] == "item"}
spell_names = {str(r["id"]): r for r in diffs if r["kind"] == "spell"}
levels = {str(r["id"]): r["source"] for r in reviewed["levels"]}

# Only selected English catalogs are eligible; leave foreign overlays untouched.
scope = read(AUDIT / "cdn-scope.json")["paths"]
for path in scope:
    if not path.endswith(".json"): continue
    path = "public/" + path
    data = read(path)
    def rename_items(value):
        if isinstance(value, list):
            for entry in value: rename_items(entry)
        elif isinstance(value, dict):
            row = item_names.get(str(value.get("id")))
            if row and value.get("name") == row["local"]: value["name"] = row["source"]
            for entry in value.values(): rename_items(entry)
    rename_items(data)
    if path == "public/data/items/catalog.json":
        for item in data["items"]:
            if item["id"] in levels: item["itemLevel"] = levels[item["id"]]
    if path == "public/data/items/foreverdb-enrichment.json":
        for item in data["newItems"]:
            if item["id"] in levels: item["itemLevel"] = levels[item["id"]]
        for iid, entry in data["entries"].items():
            if iid in levels:
                entry.setdefault("current", {})["itemLevel"] = levels[iid]
                if "itemLevel" in entry.get("classicChanges", {}):
                    entry["classicChanges"]["itemLevel"]["after"] = str(levels[iid])
            if iid in item_names and "name" in entry.get("current", {}): entry["current"]["name"] = item_names[iid]["source"]
    write(path, data)

shards = [read(f"public/data/spells/foreverdb/{i}.json") for i in range(64)]
spells = {k: v for shard in shards for k, v in shard.items()}
for sid, row in spell_names.items(): spells[sid]["n"] = row["source"]

# Read the explicit full-page effects as well as tooltips. The dwarf tooltip says
# 1% while its raw effects say 2%; retain each source field rather than inventing agreement.
spells["1259719"].update(d="Increases your chance to hit with all spells and attacks by 1%.",
    ef=[{"e": 6, "a": 54, "v": 2, "tg": 1, "sp": 1}, {"e": 6, "a": 55, "v": 2, "tg": 1, "sp": 1}])
spells["1259719"].pop("rq", None)
spells["1324306"].update(d="Sends out a blast wave of magic, inflicting 13 to 17 Arcane damage to nearby enemies and silencing them for 6 sec.",
    du=6000, ef=[{"e": 2, "v": 16, "r": 10, "sp": 1}, {"e": 6, "a": 27, "m": 127, "v": 1, "r": 10, "sp": 1}])
for sid, buff in [("1259691", "Attuned to nearby leylines, increasing the benefit of your Read Leyline ability by 100%."),
                  ("1270893", "Charged by an elemental convergence, increasing the benefit of your Skysight ability by 100%.")]:
    spells[sid].update(a=buff, du=3600000, ef=[{"e": 6, "a": 4, "v": 101, "sp": 1}])
for sid in read(POST / "db-summary.json")["unavailableSpellIds"]:
    spells[str(sid)]["unavailableInSnapshot"] = True
for i, shard in enumerate(shards): write(f"public/data/spells/foreverdb/{i}.json", shard)
index = read("public/data/spells/foreverdb/index.json")
for row in index:
    if str(row[0]) in spell_names: row[1] = spell_names[str(row[0])]["source"]
write("public/data/spells/foreverdb/index.json", index)

races = read("public/data/races/catalog.json")
for race in races["races"]:
    if race["id"] == "dwarf":
        for racial in race["racials"]:
            if racial["name"] == "Artisan's Precision": racial["spellId"] = 1259719
write("public/data/races/catalog.json", races)

quests = read("public/data/quests/quest-details.json")
for row in diffs:
    # Parenthetical dungeon names are deliberate context, not stale quest titles.
    if row["kind"] == "quest" and row["id"] in [1425, 92597]: quests["quests"][str(row["id"])]["title"] = row["source"]
q = quests["quests"]["93429"]
text = (POST / "pages/quest-93429.txt").read_text(encoding="utf8")
description = re.search(r"\nDescription\n([\s\S]*?)\nCompletion\n", text)
assert description and "Level: 35" in text and "Side: Alliance" in text
q.update(minimumLevel=30, faction="Alliance", startsAt="Karana", endsAt="Karana",
         description=description[1].strip(), experience=2750, money="18s", rewardItems=[], rewardChoices=[], sourceSnapshot="wowhead-2026-11-02")
q.pop("partial", None)
write("public/data/quests/quest-details.json", quests)

for filename in ["locations-forever-all-new-quest-givers.json", "locations-forever-all-quest-givers.json", "locations-forever-all-quests.json"]:
    path = "public/maps/world-atlas/" + filename
    layer = read(path)
    for point in layer["locations"]:
        if str(point.get("questId")) == "93429" or point["id"] == "forever-all-quest-giver-254775-1":
            point.setdefault("questInfo", {}).update(faction="Alliance", requiredLevel=30)
        if str(point.get("questId")) in ["1425", "92597"]:
            point["name"] = quests["quests"][str(point["questId"])]["title"]
        for offer in point.get("questOffers", []):
            if str(offer.get("id")) in ["1425", "92597"]:
                offer["name"] = quests["quests"][str(offer["id"])]["title"]
    write(path, layer)

english = read("src/i18n/locales/en.json")
quest_names = {r["local"]: r["source"] for r in diffs if r["kind"] == "quest" and r["id"] in [1425, 92597]}
def rename_labels(value):
    if isinstance(value, dict): return {k: rename_labels(v) for k, v in value.items()}
    if isinstance(value, list): return [rename_labels(v) for v in value]
    return quest_names.get(value, value) if isinstance(value, str) else value
write("src/i18n/locales/en.json", rename_labels(english))
(POST / "applied.json").write_text(json.dumps({"changedPaths": changed, "itemNames": len(item_names), "itemLevels": len(levels),
    "spellNames": len(spell_names), "questNames": 2, "quest93429Complete": True,
    "sourceConflicts": ["1259719: tooltip hit 1%, raw effects 2%"],
    "limits": ["NPC pages without loot tables do not prove no loot.", "Tooltip coverage is not full acquisition-table coverage."]}, indent=2), encoding="utf8")
print(json.dumps({"changedPaths": len(changed), "itemNames": len(item_names), "itemLevels": len(levels), "spellNames": len(spell_names)}))
