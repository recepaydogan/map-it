"""Reconcile complete captured tables only. Access failures never empty existing data."""
import html
import json
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/site-research/wowhead-audit-2026-11-02"

def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))

def write(path, value):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and read(path) == value: return
    temporary = target.with_suffix(".november-update.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    for attempt in range(30):
        try:
            temporary.replace(target)
            break
        except OSError:
            if attempt == 29: raise
            time.sleep(0.2)

def clean(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()

base_path = "public/data/items/catalog.json"
base = read(base_path)
base["items"] = [item for item in base["items"] if not (item.get("source") == "wowhead-2026-11-02" and re.search(r"DEPRECATED|UNUSED", item["name"], re.I))]
enrichment = read("public/data/items/foreverdb-enrichment.json")
items = {x["id"]: x for x in base["items"] + enrichment["newItems"]}

# Import usable missing-item tooltips only; most old Classic IDs have no Forever page.
for row in read(EVIDENCE / "panels/missing-item-captures.json"):
    iid, status = row
    if status not in ["cached", "ok"] or (iid in items and items[iid].get("source") != "wowhead-2026-11-02"): continue
    tip = read(EVIDENCE / f"tooltips/item-{iid}.json")
    if re.search(r"DEPRECATED|UNUSED", tip["name"], re.I): continue
    item = {"id": iid, "name": tip["name"], "nameVerified": True,
            "icon": f"data/items/site-icons/{tip['icon']}.jpg", "category": "Miscellaneous", "grade": ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary"][max(0, min(5, tip.get("quality", 1)))],
            "sections": [], "enhancements": [], "hasReference": False, "source": "wowhead-2026-11-02"}
    level = re.search(r"Item Level\s*(\d+)", clean(tip["tooltip"]))
    if level: item["itemLevel"] = int(level[1])
    stack = re.search(r"Max Stack:\s*(\d+)", clean(tip["tooltip"]))
    item["clientDetails"] = {}
    if stack: item["clientDetails"]["stackSize"] = int(stack[1])
    if "Binds when picked up" in clean(tip["tooltip"]): item["clientDetails"]["bonding"] = 1
    profession = re.search(r"Requires (Fishing) \((\d+)\)", clean(tip["tooltip"]))
    if profession: item["clientDetails"]["requiredProfession"] = {"id": profession[1].lower(), "skill": int(profession[2])}
    effect = re.search(r"<!--useEffect:0:\d+-->([\s\S]*?)<!--useEffect:1-->", tip["tooltip"])
    if effect: item["siteEffects"] = [{"kind": "use", "text": clean(effect[1])}]
    spell = re.search(r"/spell=(\d+)/([^\"]+)", effect[1]) if effect else None
    if spell: item["spellLinks"] = [{"id": spell[1], "name": spell[2].replace("-", " ").title(), "trigger": "use"}]
    if iid in items:
        items[iid].clear()
        items[iid].update(item)
    else:
        base["items"].append(item)
    items[iid] = item
write(base_path, base)

all_points = []
registry = (ROOT / "src/features/map/map-registry.ts").read_text(encoding="utf8")
active_files = re.findall(r'"([^\"]+)"', re.search(r'locationFiles:\s*\[([^\]]+)\]', registry)[1])
for filename in active_files:
    all_points += read(f"public/maps/world-atlas/{filename}").get("locations", [])
points_by_npc = {}
tables = read(EVIDENCE / "panels/source-tables.json")
for retry_tables_path in [EVIDENCE / "panels/retry/source-tables.json", EVIDENCE / "post-publication/pages/source-tables.json"]:
    if not retry_tables_path.exists(): continue
    for npc_id, table in read(retry_tables_path).items():
        # Only complete arrays can supersede a table; a blocked/unparsed page
        # never turns a known inventory or drop list into an empty record.
        complete = {key: rows for key, rows in table.items() if isinstance(rows, list)}
        if complete: tables[npc_id] = {**tables.get(npc_id, {}), **complete}
english = read("src/i18n/locales/en.json")
def english_key(key):
    result = english
    for part in key.split("."):
        result = result.get(part, {}) if isinstance(result, dict) else {}
    return result if isinstance(result, str) else ""

vendor_names = {}
for npc_id, table in tables.items():
    if "sells" not in table: continue
    meta_path = EVIDENCE / f"panels/npc-{npc_id}-meta.json"
    tip_path = EVIDENCE / f"tooltips/npc-{npc_id}.json"
    retry_meta = EVIDENCE / f"panels/retry/npc-{npc_id}-meta.json"
    post_meta = EVIDENCE / f"post-publication/pages/npc-{npc_id}-meta.json"
    if post_meta.exists() and read(post_meta).get("status") == "accessible":
        name = read(post_meta)["title"].split(" - NPC")[0].strip().casefold()
    elif retry_meta.exists() and read(retry_meta).get("status") == "accessible":
        name = read(retry_meta)["title"].split(" - NPC")[0].strip().casefold()
    elif meta_path.exists():
        name = read(meta_path)["title"].split(" - NPC")[0].strip().casefold()
    elif tip_path.exists():
        name = read(tip_path)["name"].strip().casefold()
    else:
        continue
    vendor_names.setdefault(name, set()).add(npc_id)
marker_vendors = {}
for p in all_points:
    if p.get("entityId"):
        points_by_npc.setdefault(p["entityId"], []).append(p)
    name = p.get("name") or english_key(p.get("nameKey", ""))
    matches = vendor_names.get(name.strip().casefold(), set())
    if len(matches) == 1 and p.get("category") in ["npc", "innkeeper", "ammunition-vendor", "reagent-vendor", "repair-vendor", "merchant", "profession-trainer", "rare"]:
        npc_id = next(iter(matches))
        marker_vendors[p["id"]] = npc_id
        if p not in points_by_npc.get(npc_id, []):
            points_by_npc.setdefault(npc_id, []).append({**p, "name": name})

rares_path = "public/data/rares/details.json"
rares = read(rares_path)
rare_by_id = {str(x["id"]): x for x in rares["entries"]}
for retry_facts_path in [EVIDENCE / "panels/retry/npc-facts.json", EVIDENCE / "post-publication/pages/npc-facts.json"]:
    if not retry_facts_path.exists(): continue
    known_types = english["map"]["rares"]["types"]
    for record in read(retry_facts_path):
        entry = rare_by_id.get(record["id"])
        if not entry: continue
        fields = record["fields"]
        level = fields.get("Level", "")
        if re.fullmatch(r"\d+", level):
            entry["level"] = int(level)
            entry.pop("levelRange", None)
        elif re.fullmatch(r"\d+\s*[-–]\s*\d+", level):
            entry["levelRange"] = level
            entry.pop("level", None)
        for field in ["Health", "Mana"]:
            if re.fullmatch(r"[\d,]+", fields.get(field, "")): entry[field.lower()] = fields[field]
        creature_type = fields.get("Type", "").lower().replace(" ", "-")
        if creature_type in known_types: entry["type"] = creature_type
        classification = {"Rare": "rare", "Rare Elite": "rare-elite"}.get(fields.get("Classification"))
        if classification: entry["classification"] = classification
replaced = []
for npc_id, entry in rare_by_id.items():
    table = tables.get(npc_id, {})
    if "drops" not in table: continue
    drops = []
    for row in table["drops"]:
        iid = str(row["id"])
        item = items.get(iid)
        old = next((d for d in entry.get("drops", []) if d["id"] == iid), {})
        drop = {"id": iid, "name": row.get("displayName", row["name"]),
                "icon": item.get("icon", old.get("icon", "")) if item else old.get("icon", ""), "inItemCatalog": bool(item)}
        count, sample = row.get("count"), row.get("outof")
        if isinstance(count, (int, float)) and isinstance(sample, (int, float)) and 0 <= count <= sample and sample > 0:
            drop.update(percent=round(count / sample * 100, 2), observed=count, sampleSize=sample)
        if isinstance(row.get("percentOverride"), (int, float)) and 0 <= row["percentOverride"] <= 100:
            drop["percent"] = row["percentOverride"]
        drops.append(drop)
    entry["drops"] = drops
    replaced.append(npc_id)
if "256410" not in rare_by_id:
    # Tooltip proves classification/type, but not level, health or a complete loot table.
    tip = read(EVIDENCE / "tooltips/npc-256410.json")
    assert tip["name"] == "Reginald Holmsby" and "Humanoid (Rare)" in tip["tooltip"]
    entry = {"id": 256410, "classification": "rare", "type": "humanoid", "partial": True}
    rares["entries"].append(entry)
write(rares_path, rares)

quest_path = "public/data/quests/quest-details.json"
quests = read(quest_path)
source_quests = {str(x["id"]): x for x in read(EVIDENCE / "quests-list.json")}
updated_quests, skipped = [], []
def reward(iid, quantity):
    iid = str(iid)
    item = items.get(iid)
    old_refs = [r for q in quests["quests"].values() for field in ["rewardItems", "rewardChoices", "objectiveItems"] for r in q.get(field, []) if r["id"] == iid]
    tip_path = EVIDENCE / f"tooltips/item-{iid}.json"
    tip = read(tip_path) if tip_path.exists() else None
    name = item["name"] if item else tip["name"] if tip else old_refs[0]["name"] if old_refs else None
    # Unknown names are represented as IDs by localized UI, never invented item names.
    result = {"id": iid, "name": name or iid, "quantity": quantity}
    icon = item.get("icon") if item else old_refs[0].get("icon") if old_refs else None
    if icon: result["icon"] = icon
    return result

for candidate in read(EVIDENCE / "panels/quest-reward-diff.json"):
    qid = candidate["id"]
    source = source_quests[qid]
    local = quests["quests"].get(qid)
    if not local or clean(local["title"]).replace(" ", "").lower() != clean(source["name"]).replace(" ", "").lower():
        skipped.append(qid)
        continue
    fields = candidate["differences"]
    for key, source_key in [("level", "level"), ("minimumLevel", "reqlevel"), ("experience", "xp")]:
        if key in fields: local[key] = source[source_key]
    if "title" in fields: local["title"] = source["name"]
    if "rewardItems" in fields or "rewardChoices" in fields:
        fixed = source.get("itemrewards", [])
        fixed_ids = {row[0] for row in fixed}
        # Wowhead retains legacy choice rows after converting them to fixed rewards.
        # A fixed reward wins when the same ID is also present in itemchoices.
        choices = [r for r in source.get("itemchoices", []) if r[0] not in fixed_ids]
        local["rewardItems"] = [reward(i, n) for i, n in fixed]
        local["rewardChoices"] = [reward(i, n) for i, n in choices]
        for obsolete in ["rewards", "rewardChoice", "reward"]: local.pop(obsolete, None)
    updated_quests.append(qid)
    local["sourceSnapshot"] = "wowhead-2026-11-02"
if "93429" not in quests["quests"]:
    tip = read(EVIDENCE / "tooltips/quest-93429.json")
    assert tip["name"] == "Blood of My Blood"
    quests["quests"]["93429"] = {"id": "93429", "title": tip["name"], "level": 35, "faction": "Neutral", "startsAt": "Karana", "objective": "Slay 10 Lost Ones in the Fallow Sanctuary.", "partial": True}
write(quest_path, quests)
quests["allMapQuestCount"] = len({p["questId"] for p in read("public/maps/world-atlas/locations-forever-all-quests.json")["locations"]})
write(quest_path, quests)

for filename in active_files:
    path = f"public/maps/world-atlas/{filename}"
    layer = read(path)
    for point in layer.get("locations", []):
        qid = point.get("questId")
        if qid in updated_quests:
            point["questLevel"] = quests["quests"][qid]["level"]
        for offer in point.get("questOffers", []):
            qid = str(offer.get("id"))
            if qid in updated_quests:
                offer["level"] = quests["quests"][qid]["level"]
    write(path, layer)
search_path = "public/data/map-search/index.json"
search = read(search_path)
for row in search["locations"]:
    point = row["point"]
    qid = point.get("questId")
    if qid in updated_quests: point["questLevel"] = quests["quests"][qid]["level"]
    for offer in point.get("questOffers", []):
        qid = str(offer.get("id"))
        if qid in updated_quests: offer["level"] = quests["quests"][qid]["level"]
write(search_path, search)

for path in ["public/data/dungeons/observed-quests.json", "public/data/dungeons/excavation-site-wetlands.json"]:
    data = read(path)
    for record in data["quests"]:
        qid = str(record["id"])
        if qid not in updated_quests: continue
        current = quests["quests"][qid]
        if clean(record["title"]).casefold() != clean(current["title"]).casefold(): continue
        for field in ["level", "minimumLevel", "experience", "rewardChoices", "rewardItems"]:
            if field in current: record[field] = current[field]
        record["sourceSnapshot"] = "wowhead-2026-11-02"
    write(path, data)

# Vendor offers use their own compact schema; prices are the captured purchase lots.
vendors = {}
for npc_id, table in tables.items():
    if "sells" not in table: continue
    offers = []
    for row in table["sells"]:
        iid = str(row["id"])
        item = items.get(iid)
        offer = {"id": iid, "name": row.get("displayName", row["name"]), "inItemCatalog": bool(item)}
        if item and item.get("icon"): offer["icon"] = item["icon"]
        costs = row.get("cost", [])
        if costs and isinstance(costs[0], list) and len(costs[0]) == 3:
            copper, currencies, trade_items = costs[0]
            offer["copper"] = copper
            if currencies: offer["currencies"] = currencies
            if trade_items: offer["items"] = trade_items
        if isinstance(row.get("stack"), list) and row["stack"]: offer["quantity"] = row["stack"][0]
        if row.get("avail", -1) >= 0: offer["stock"] = row["avail"]
        offers.append(offer)
    vendors[npc_id] = offers
write("public/data/vendors/inventories.json", {"version": 1, "vendors": vendors, "markers": marker_vendors})

# Mirror rare sources and captured vendors into the existing How to obtain shards.
source_shards = [read(f"public/data/items/research/sources/{i}.json") for i in range(64)]
sold_shards = [read(f"public/data/items/research/sold/{i}.json") for i in range(64)]
for shard in source_shards:
    for iid, records in shard.items():
        shard[iid] = [r for r in records if r.get("src") != "wowhead-map"]
for shard in sold_shards:
    for record in shard.values():
        record["v"] = [r for r in record["v"] if r.get("src") != "wowhead-map"]

for entry in rares["entries"]:
    npc_id = str(entry["id"])
    points = [p for p in points_by_npc.get(npc_id, []) if p.get("category") in ["rare", "rare-elite"]]
    if not points: continue
    point = points[0]
    for drop in entry.get("drops", []):
        iid = drop["id"]
        sources = source_shards[int(iid) % 64].setdefault(iid, [])
        # Replace the same mapped NPC's legacy source to avoid duplicate/contradictory chances.
        sources[:] = [s for s in sources if not (s.get("t") == "drop" and s.get("npc") == entry["id"])]
        source = {"t": "drop", "src": "wowhead-map", "n": point.get("name", npc_id), "npc": entry["id"], "mapId": "azeroth", "markerId": point["id"]}
        if "percent" in drop: source["pct"] = drop["percent"]
        if "observed" in drop: source["seen"] = drop["observed"]
        sources.append(source)
for npc_id, offers in vendors.items():
    points = points_by_npc.get(npc_id, [])
    if not points: continue
    point = points[0]
    for offer in offers:
        iid = offer["id"]
        record = sold_shards[int(iid) % 64].setdefault(iid, {"total": 0, "v": []})
        record["v"] = [r for r in record["v"] if r["npc"] != int(npc_id)]
        record["v"].append({"npc": int(npc_id), "n": point.get("name", npc_id), "zone": point.get("region", ""), "src": "wowhead-map", "mapId": "azeroth", "markerId": point["id"]})
        record["total"] = max(record["total"], len(record["v"]))

blueprints = {"273085", "273087", "273092", "273096", "273103", "273106", "273141"}
for iid in blueprints:
    shard = source_shards[int(iid) % 64]
    if iid in shard: shard[iid] = [r for r in shard[iid] if "happy camper" not in str(r.get("n", "")).lower()]
for i in range(64):
    write(f"public/data/items/research/sources/{i}.json", source_shards[i])
    write(f"public/data/items/research/sold/{i}.json", sold_shards[i])

write(EVIDENCE / "applied-panels.json", {"rareTables": len(replaced), "quests": updated_quests, "identitySkipped": skipped, "vendors": len(vendors), "vendorOffers": sum(map(len, vendors.values())), "limits": "An accessible NPC page without a drops table does not prove an empty loot table."})
print("Applied", len(replaced), "rare tables,", len(updated_quests), "quests,", len(vendors), "vendor inventories; skipped identities:", skipped)
