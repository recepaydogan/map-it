"""Apply the captured November 2 evidence, preserving unverified records and translations.

Only English source catalogs are touched. Captures remain the reviewable provenance;
this script never publishes content or writes locale overlays.
"""
import copy
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/site-research/wowhead-audit-2026-11-02"
CHANGES = {}


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def write(path, value):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    old = read(path) if target.exists() else None
    if old != value:
        target.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
        CHANGES[str(path)] = True


def text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def tooltip(kind, entity_id):
    path = EVIDENCE / f"tooltips/{kind}-{entity_id}.json"
    return read(path) if path.exists() else None


def description(tip):
    match = re.search(r'<div class="q">([\s\S]*?)</div>', tip.get("tooltip", ""))
    return text(match[1]) if match else ""


spell_root = Path("public/data/spells/foreverdb")
shards = [read(spell_root / f"{i}.json") for i in range(64)]
spells = {k: v for shard in shards for k, v in shard.items()}
icon_ids = {}
for path in (EVIDENCE / "tooltips").glob("spell-*.json"):
    tip = read(path)
    local = spells.get(path.stem.split("-")[1])
    if local and tip.get("icon"):
        icon_ids.setdefault(tip["icon"], local["ic"])

# Negative icon IDs designate app-owned Wowhead image assets, never game file IDs.
custom_icons = {}
def icon_id(tip, sid):
    icon = tip.get("icon")
    if icon in icon_ids:
        if icon_ids[icon] < 0:
            custom_icons[str(icon_ids[icon])] = icon
        return icon_ids[icon]
    if not icon:
        raise ValueError(f"Missing verified spell icon {sid}")
    icon_ids[icon] = -int(sid)
    custom_icons[str(-int(sid))] = icon
    return -int(sid)


talents_path = "public/data/classes/talent-calculator.json"
catalog = read(talents_path)
source = read(EVIDENCE / "talents-classic.json")
before_talents = copy.deepcopy(catalog)
class_ids = {"Warrior": 1, "Paladin": 2, "Hunter": 3, "Rogue": 4, "Priest": 5, "Shaman": 7, "Mage": 8, "Warlock": 9, "Druid": 11}
talent_spell_text = {}
for cls in catalog["classes"]:
    for tree in cls["trees"]:
        key_name = (cls["n"] + tree["n"]).replace(" ", "").replace("Combat", "")
        key_name = {"PaladinRetribution": "Paladin", "WarlockAffliction": "WarlockCurses", "WarlockDemonology": "WarlockSummoning"}.get(key_name, key_name)
        keys = [key for key, value in source["trees"].items() if value["description"].replace("Combat", "") == key_name]
        if not keys:
            keys = [key for key, value in source["trees"].items() if value["description"].startswith(cls["n"]) and tree["n"].replace(" ", "") in value["description"]]
        assert len(keys) == 1, key_name
        old = {entry["id"]: entry for entry in tree["talents"]}
        result = []
        for value in source["talents"][keys[0]].values():
            sid = value["ranks"][0]
            tip = tooltip("spell", sid)
            assert tip and text(tip["name"]) == text(value["name"]), (sid, value["name"])
            descriptions = [text(value["descriptions"][str(i + 1)]) for i in range(len(value["ranks"]))]
            previous = old.get(value["id"], {})
            talent = {**previous, "id": value["id"], "n": value["name"], "row": value["row"], "col": value["col"],
                      "ic": icon_id(tip, sid), "ranks": value["ranks"], "d": descriptions,
                      "pre": [[req["id"], req["qty"] - 1] for req in value.get("requires", [])]}
            # Old active headers/effects must not follow reused talent IDs.
            if previous.get("n") != value["name"]:
                for field in ["header", "requires", "passive"]:
                    talent.pop(field, None)
            talent["passive"] = not bool(re.search(r"\b(?:Instant|\d+(?:\.\d+)? sec cast|Channeled)\b", text(tip["tooltip"])))
            result.append(talent)
            # Payload descriptions are rank-resolved; generic tooltips can incorrectly display 0%.
            record = spells.get(str(sid))
            if not record:
                record = {"id": sid, "n": value["name"], "r": "", "ic": talent["ic"], "cl": class_ids[cls["n"]], "ct": 0}
                spells[str(sid)] = record
                shards[sid % 64][str(sid)] = record
            record.update(n=value["name"], ic=talent["ic"], d=descriptions[0], rk=descriptions, pa=1 if talent["passive"] else 0)
            talent_spell_text[str(sid)] = descriptions
        tree["talents"] = sorted(result, key=lambda t: (t["row"], t["col"], t["id"]))
catalog["sourceSnapshot"] = "wowhead-2026-11-02"
write(talents_path, catalog)

# New active spells and explicitly named tuning targets: no blanket formula replacement.
tuning_ids = set(int(value) for row in read(EVIDENCE / "tuning-links.json") for value in re.findall(r"spell=(\d+)", str(row)))
new_spell_ids = {1328370, 1328544, 1328546, 1328548, 1328550, 1328569, 1328613, 1328617, 1328621}
targets = tuning_ids | new_spell_ids | {3166, 20554, 20572, 2481, 1259918, 1260189}
targets.update(int(k) for k, v in spells.items() if v["n"] in ["Arcane Blast", "Ice Lance", "Ice Barrier", "Shifting Power", "Wild Growth", "Shadow Word: Death", "Revenge", "Holy Shield", "Aspect of the Hawk", "Trueshot Aura", "Righteous Fury"])
for sid in sorted(targets):
    tip = tooltip("spell", sid)
    if not tip:
        continue
    record = spells.get(str(sid))
    if not record:
        record = {"id": sid, "n": tip["name"], "r": "", "ic": icon_id(tip, sid), "ct": 0, "cl": 2 if sid == 1328370 else 0}
        spells[str(sid)] = record
        shards[sid % 64][str(sid)] = record
    if text(record["n"]) != text(tip["name"]):
        continue
    d = description(tip)
    # Do not install unresolved formulas/0% talent summaries over the calculator payload.
    if d and str(sid) not in talent_spell_text and not re.search(r"\$|\b0%", d):
        record["d"] = d
    head = tip["tooltip"].split('<div class="q">')[0]
    header = text(head)
    cooldown = re.search(r"(\d+(?:\.\d+)?) (sec|min) cooldown", header)
    if cooldown:
        record["cd"] = round(float(cooldown[1]) * (60000 if cooldown[2] == "min" else 1000))
    cast = re.search(r"(\d+(?:\.\d+)?) sec cast", header)
    if cast:
        record["ct"] = round(float(cast[1]) * 1000)
    elif "Instant" in header:
        record["ct"] = 0
    cost = re.search(r"(\d+) (Mana|Rage|Energy|Focus)\b", header)
    if cost:
        record["co"] = [[int(cost[1]), cost[2], 0]]
    level = re.search(r"Requires level (\d+)", header)
    if level:
        record["lv"] = int(level[1])
    rg = re.search(r"(\d+) yd range", header)
    if rg:
        record["rg"] = [0, int(rg[1])]

spells["3166"]["d"] = "Increases Intellect by 3 for 30 min."
spells["3166"]["a"] = "Intellect increased by 3."
spells["3166"]["du"] = 1800000
for effect in spells["3166"].get("ef", []):
    if effect.get("a") == 29:
        effect["v"] = 3
spells["20554"]["du"] = 15000

# These effect values are explicitly identified by the tuning article/current tooltip.
# Leave unrelated level-scaling coefficients alone.
for sid, record in spells.items():
    tip = tooltip("spell", sid) if int(sid) in targets else None
    if not tip or text(tip["name"]) != text(record["n"]): continue
    current_description = description(tip)
    if record["n"] == "Ice Lance" and "300%" in current_description:
        for effect in record.get("ef", []):
            if effect.get("e") == 3 and effect.get("v") == 200: effect["v"] = 300
    if record["n"] == "Shadow Word: Death" and "30%" in current_description:
        for effect in record.get("ef", []):
            if effect.get("e") == 3 and effect.get("v") == 10: effect["v"] = 30
    if record["n"] == "Holy Shield":
        damage = re.search(r"deals (\d+) Holy damage", current_description)
        if damage:
            for effect in record.get("ef", []):
                if effect.get("a") == 43: effect["v"] = int(damage[1])
    if record["n"] == "Revenge" and int(sid) in {6572, 6574, 7379, 11600, 11601, 25288}:
        for effect in record.get("ef", []):
            if effect.get("e") == 2: effect["ap"] = 0.25
    buff = text(tip.get("buff", ""))
    buff = re.sub(r"^" + re.escape(record["n"]) + r"\s*", "", buff)
    if buff and not re.search(r"\$|\?", buff): record["a"] = buff
for effect in spells["12579"].get("ef", []):
    if effect.get("a") == 271 and effect.get("v") == 5: effect["v"] = 20
spells["1311085"]["unavailableInSnapshot"] = True

index_path = spell_root / "index.json"
index = read(index_path)
indexed = {row[0]: row for row in index}
for sid in new_spell_ids:
    record = spells[str(sid)]
    if sid not in indexed:
        index.append([sid, record["n"], record["r"], record["ic"], record.get("cl", 0), 1, 0])
for row in index:
    if str(row[0]) in talent_spell_text:
        row[1] = spells[str(row[0])]["n"]
        row[3] = spells[str(row[0])]["ic"]
write(index_path, sorted(index, key=lambda row: row[0]))
for i, shard in enumerate(shards):
    write(spell_root / f"{i}.json", shard)
manifest = read(spell_root / "manifest.json")
manifest["count"] = len(index)
write(spell_root / "manifest.json", manifest)
write("data/site-research/wowhead-audit-2026-11-02/custom-spell-icons.json", custom_icons)

# The class ability browser uses a separate talent index from the calculator.
class_spells_path = spell_root / "classes.json"
class_spells = read(class_spells_path)
for cls in catalog["classes"]:
    entry = next(c for c in class_spells if c["n"] == cls["n"])
    levels = {row["id"]: row["level"] for row in source["abilities"].get(str(class_ids[cls["n"]]), [])}
    for ability in entry["abilities"]:
        for rank in ability["ranks"]:
            if rank["id"] in levels:
                rank["lv"] = levels[rank["id"]]
        if ability["ranks"]:
            ability["lv"] = min(rank.get("lv", ability.get("lv", 1)) for rank in ability["ranks"])
    for tree in cls["trees"]:
        target = next(t for t in entry["trees"] if t["n"] == tree["n"])
        by_id = {t["id"]: t for t in target["talents"]}
        target["talents"] = [{**{k: v for k, v in by_id.get(t["id"], {}).items() if k not in ["v", "gate"]},
                              **t, "sp": t["ranks"][0], "lv": 10 + t["row"] * 5, "max": len(t["ranks"]),
                              "gate": [t["row"] * 5, 0]} for t in tree["talents"]]
write(class_spells_path, class_spells)

race_path = "public/data/races/catalog.json"
races = read(race_path)
for race in races["races"]:
    for racial in race["racials"]:
        name = racial["name"]
        if name == "Berserking":
            racial["effect"] = racial["effect"].replace("for 10 sec", "for 15 sec")
        elif name == "Find Treasure":
            racial["effect"] = "Allows the dwarf to sense nearby treasure, making it appear on the minimap and sometimes increasing treasure found. Lasts until cancelled."
        elif name == "Touch of the Grave" and "15 sec" not in racial["effect"]:
            racial["effect"] += " This effect has a 15 sec internal cooldown."
        elif name == "Plainsrunning":
            racial["effect"] = "Gain 2% increased movement speed every 5 sec spent moving, up to 60%. Taking damage or standing still reduces this effect. Does not increase mounted movement speed."
        elif name == "Blood Fury" and "cooldown" not in racial["effect"]:
            racial["effect"] += " 2 min cooldown."
        elif name in ["Skysight", "Read Leyline"]:
            # Keep announced restrictions; surface the differing DB wording explicitly.
            tip = tooltip("spell", racial["spellId"])
            racial["databaseEffect"] = description(tip)
            racial["sourceConflict"] = True
write(race_path, races)

items_path = "public/data/items/catalog.json"
items = read(items_path)
enrichment_path = "public/data/items/foreverdb-enrichment.json"
enrichment = read(enrichment_path)
items_by_id = {item["id"]: item for item in items["items"] + enrichment["newItems"]}
items_by_id["3383"]["siteEffects"] = [{"kind": "use", "text": "Increases Intellect by 3 for 30 min."}]
enrichment["entries"]["3383"]["current"]["siteEffects"] = items_by_id["3383"]["siteEffects"]
knife = items_by_id["269716"]
knife["itemLevel"] = 18
knife["siteEffects"] = [{"kind": "equip", "text": "Increases damage and healing done by magical spells and effects by up to 10."}, {"kind": "equip", "text": "Increased Skinning +3."}]
e = enrichment["entries"]["269716"]
e["current"].update(itemLevel=18, siteEffects=knife["siteEffects"])
for stats in [e["stats"], e["current"]["stats"]]:
    for stat in stats:
        if stat["key"] == "fd-damage": stat["value"] = "6–12"
        if stat["key"] == "fd-dps": stat["value"] = "6.0"
write(items_path, items)
write(enrichment_path, enrichment)

prof_path = "public/data/professions/catalog.json"
prof = read(prof_path)
recipe_values = {"Acolyte's Chain Shirt": 80, "Acolyte's Chain Leggings": 95, "Acolyte's Chain Helm": 125}
for entry in prof["professions"]:
    for recipe in entry["recipes"] + entry.get("featured", []):
        if recipe["name"] in recipe_values:
            skill = recipe_values[recipe["name"]]
            recipe.update(skill=skill, clientSkill=skill, estimatedSkill=False)
            if recipe.get("skillThresholds"):
                recipe["skillThresholds"][0] = skill
write(prof_path, prof)
details_path = "public/data/professions/details/blacksmithing.json"
details = read(details_path)
for recipe in details["recipes"]:
    if recipe["n"] in recipe_values: recipe["req"] = recipe_values[recipe["n"]]
write(details_path, details)

print("Prepared", len(CHANGES), "catalog files;", len(custom_icons), "new icon assets required")
