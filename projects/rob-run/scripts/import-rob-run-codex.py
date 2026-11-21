"""Join public RobrunCodex facts to local game assets and stable marker IDs."""
import argparse
import json
import math
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup


HOST = "https://robruncodex.com"
MAPS = {
    "looty-bay": "looty-bay", "prison": "prison", "lennys-motel": "lennys-motel",
    "sales-center": "sales-center", "settlement": "wiki-settlement", "world": "wiki-world",
}
KIND_CATEGORY = {
    "art": "art", "weapons": "weapons-loot", "jewellery": "jewelry", "bank_vault": "vault-loot",
    "car_parts": "car-parts", "cash_register": "cash-register", "deposit_box": "deposit-box",
    "gear": "gear-loot", "vehicle": "parking", "alarm": "alarm-panel", "metal_detector": "metal-detector",
    "event_cargo": "event-cargo", "cargo_exchange": "cargo-exchange",
}
LOOT_ART_KINDS = {
    "alcohol", "art", "bank_vault", "car_parts", "cash", "cash_register", "container",
    "deposit_box", "drugs", "electronics", "gear", "jewellery", "medicine", "safe", "weapons",
}
MARKER_DESCRIPTION_KINDS = {
    "trash", "container", "safe", "deposit_box", "door", "camera", "alarm", "metal_detector",
    "buyer", "cargo_exchange", "launderer", "trader", "atm", "vehicle", "tattoo_master",
    "plot", "world-hex world-hex-plot", "cell_block",
}

SHORT_MARKER_NAMES = {
    "Alcohol or cigars": "Alcohol & Cigars", "Weapons or ammunition": "Weapons & Ammo",
    "Possible loot": "Loot Container", "Trash Cans": "Trash Can", "Trash container": "Trash Can",
    "Cash Registers": "Cash Register", "Deposit Boxes": "Deposit Box",
    "Other Containers": "Container", "Safes": "Safe",
}


def fetch(path, cache):
    file = cache / path.strip("/").replace("/", "_")
    if not file.is_file():
        with urlopen(Request(HOST + path, headers={"User-Agent": "Mozilla/5.0"}), timeout=25) as response:
            file.write_bytes(response.read())
    return file.read_bytes()


def read_map(name, cache):
    path = f"/en/maps/{name}/"
    page = fetch(path, cache)
    data = re.findall(rb"/data/[0-9a-f]+/maps/[a-z0-9-]+\.json", page)
    data_path = next(value.decode() for value in data if value.endswith(f"/{name}.json".encode()))
    return json.loads(fetch(data_path, cache))


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def load(path):
    return json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


class ItemIndex:
    def __init__(self, items):
        self.ids = {}
        self.names = defaultdict(list)
        self.by_id = {item["id"]: item for item in items}
        for item in items:
            for value in (item["id"], item.get("gameId")):
                if value:
                    self.ids.setdefault(slug(value), item["id"])
            self.names[item["name"].strip().casefold()].append(item["id"])
        for item in items:
            if sprite := item.get("sourceSprite"):
                self.ids.setdefault(slug(sprite), item["id"])

    def match(self, item):
        asset = Path(item.get("icon") or "").stem
        source_id = item.get("item_id") or item.get("id") or ""
        if slug(source_id) in self.ids:
            return self.ids[slug(source_id)]
        if slug(asset) in self.ids:
            return self.ids[slug(asset)]
        names = self.names[item["name"].strip().casefold()]
        if len(names) == 1:
            return names[0]
        return None


FILL_POINTS = {
    "action-camera-1": 40,
    "action-camera-2": 70,
    "action-camera-3": 100,
    "code-tablet-1": 4,
    "deposit-box-keys-1": 60,
    "usb-hacking-tool-1": 5,
    "cargo-sheet-2": 12,
    "cargo-sheet-3": 36,
}


RARITY_ITEM_LINKS = {
    "cargo-minimarket": "native-cargo-minimarket",
    "cargo-electronics": "native-cargo-electronics",
    "cargo-equip": "native-cargo-equip",
    "cargo-jewelry": "native-cargo-jewelry",
    "cargo-medicine": "native-cargo-medicine",
    "cargo-carparts": "native-cargo-carparts",
    "cargo-exchange-workbench-additional-slot": "tool-box-cargo_exchange_workbench_additional_slot_upgrade",
}


def add_item_rarities(facts, rows, items):
    by_source = {row["id"]: row for row in rows}
    by_name = defaultdict(list)
    for row in rows:
        by_name[row["name"].strip().casefold()].append(row)
    facts_by_sprite = {item["sourceSprite"]: facts[item["id"]] for item in items
                       if item.get("sourceSprite") and item.get("gameId") and item["id"] in facts}
    added = 0
    for item in items:
        item_id = item["id"]
        if item.get("rarity") or facts.get(item_id, {}).get("rarity"):
            continue
        matches = by_name[item["name"].strip().casefold()]
        row = by_source.get(RARITY_ITEM_LINKS.get(item_id))
        if row is None and len(matches) == 1:
            row = matches[0]
        if row and row.get("rarity"):
            fields = facts_by_sprite.get(item.get("sourceSprite"), {})
            if fields.get("sourceId") != row["id"]:
                fields = {}
            facts[item_id] = {**fields, **facts.get(item_id, {}), "sourceId": row["id"],
                              "type": row["item_type"], "rarity": row["rarity"]}
            added += 1
    return added


def read_item_facts(cache, index, cargo):
    catalogue = BeautifulSoup(fetch("/en/database/", cache), "html.parser")
    rows = json.loads(catalogue.find("script", type="application/json").string)
    cargo_ids = {f"native-{slug(row['id'])}": row["id"] for row in cargo}
    cargo_facts = {cargo_ids[row["id"]]: dict(sellPrice=row["sell_price"], rarity=row["rarity"])
                   for row in rows if row["id"] in cargo_ids}
    source_ids = {row["id"]: index.match(row) for row in rows if row["id"] not in cargo_ids}
    for source_id, local_id in source_ids.items():
        if local_id:
            index.ids.setdefault(source_id, local_id)

    def read_item(row):
        item_id = source_ids.get(row["id"])
        if not item_id:
            return None
        fact = {key: row[key] for key in ("rarity", "tier", "width", "height") if row.get(key) is not None}
        fact.update(sourceId=row["id"], type=row["item_type"])
        if points := FILL_POINTS.get(row["id"]):
            fact["fillPoints"] = points
        for key, field in (("research_price", "researchPrice"), ("buy_price", "buyPrice"), ("sell_price", "sellPrice")):
            if row.get(key) is not None:
                fact[field] = row[key]
        if not row.get("weapon"):
            return item_id, fact
        weapon = {key: val for key, val in row["weapon"].items() if key not in ("item_id", "ammo_item_id") and val is not None}
        ammo = source_ids.get(row["weapon"].get("ammo_item_id"))
        if ammo:
            weapon["ammo"] = ammo
        soup = BeautifulSoup(fetch(f"/en/items/{row['id']}/", cache), "html.parser")
        sections = {h.get_text(strip=True): h.parent for h in soup.select("main section > h2")}
        stats = sections.get("Weapon statistics")
        if stats:
            fast = re.search(r"Fast reload\s*\|\s*([\d.]+) s", stats.get_text(" | ", strip=True))
            if fast:
                weapon["fast_reload_seconds"] = float(fast[1])
        spread = sections.get("Spread")
        if spread:
            weapon["spread"] = {slug(a.get_text(strip=True)): b.get_text(strip=True)
                                for a, b in zip(spread.select("dt"), spread.select("dd"))}
        knockdown = sections.get("Armor knockdown")
        if knockdown:
            weapon["knockdown"] = [
                [cell.get_text(" ", strip=True) for cell in tr.find_all(("th", "td"))]
                for tr in knockdown.select("tbody tr")
            ]
            dps = re.search(r"DPS\s*\|\s*(\d+)", knockdown.get_text(" | ", strip=True))
            if dps:
                weapon["dps"] = int(dps[1])
        requirements = sections.get("Requirements")
        if requirements:
            min_level = re.search(r"\blvl\s*(\d+) settlement", requirements.get_text(" ", strip=True), re.I)
            if min_level:
                fact["settlementLevel"] = int(min_level[1])
        fact["weapon"] = weapon
        return item_id, fact

    with ThreadPoolExecutor(max_workers=4) as pool:
        imported = [row for row in pool.map(read_item, rows) if row]
    facts = dict(reversed(imported))
    add_item_rarities(facts, rows, index.by_id.values())
    return facts, cargo_facts, len(rows)


def read_barters(cache, index, local):
    soup = BeautifulSoup(fetch("/en/barters/", cache), "html.parser")

    def item_amount(anchor):
        source_id = anchor["href"].strip("/").split("/")[-1]
        item_id = index.ids.get(slug(Path(anchor.img["src"]).stem)) or index.ids.get(source_id)
        if not item_id:
            raise ValueError(f"Unmatched barter item: {source_id}")
        item = index.by_id[item_id]
        label = anchor.strong.get_text(strip=True)
        amount = re.match(r"([\d,]+) ×", label) or re.match(r"\$([\d,]+)$", label)
        if not amount:
            raise ValueError(f"Invalid barter quantity: {label}")
        row = dict(item=item.get("gameId") or item_id, amount=int(amount[1].replace(",", "")))
        if anchor.small and "Fully filled" in anchor.small.get_text():
            row["fullyFilled"] = True
        return row

    def key(item, requires):
        return item, tuple(sorted((row["item"], row["amount"]) for row in requires))

    by_recipe = {key(row["resultItem"], row["requires"]): row["id"] for row in local}
    additions = []
    annotations = {}
    for heading in soup.select("main h4"):
        if heading.get_text(strip=True) != "You give":
            continue
        payment = [item_amount(anchor) for anchor in heading.parent.select("li a")]
        result = item_amount(heading.parent.find_next_sibling().select_one("li a"))
        recipe = key(result["item"], payment)
        if recipe in by_recipe:
            annotations[by_recipe[recipe]] = [row["item"] for row in payment if row.get("fullyFilled")]
        else:
            additions.append(dict(id=f"codex-{slug(result['item'])}", resultItem=result["item"],
                                  amount=result["amount"], requires=payment, supplemental=True))
    print("barters", len(annotations), "matched;", len(additions), "reference-only offers")
    return dict(barters=additions, fullyFilled=annotations)


def read_shipment_metadata(cache, index, native):
    def unpack(value):
        kind, payload = value
        if kind == 1:
            return [unpack(entry) for entry in payload]
        if kind == 0 and isinstance(payload, dict):
            return {key: unpack(entry) for key, entry in payload.items()}
        return payload

    soup = BeautifulSoup(fetch("/en/research/", cache), "html.parser")
    planner = soup.find("astro-island", attrs={"component-url": re.compile("ResearchPlanner")})
    rows = unpack(json.loads(planner["props"])["data"])["nodes"]
    native_ids = {entry["item"] for entry in native[-1]["nodes"]}
    matches = {}
    for row in rows:
        key = index.by_id.get(index.match(row), {}).get("gameId")
        if key in native_ids:
            matches[key] = dict(category=row["category"], settlementLevel=row["settlement_level"])
    print("shipments", len(matches), "matched source records out of", len(rows))
    return matches


def marker_facts(source, index, pools):
    info, details = source["info"], source.get("details") or {}
    fact = dict(kind=source["subcategory_key"], sourceId=source["id"])
    if source["category_key"] == "buildings":
        fact["title"] = info["name"]
    if info.get("district"):
        fact["district"] = info["district"]
    if info.get("activities"):
        fact["activities"] = list(dict.fromkeys(info["activities"]))
    if inside := details.get("inside"):
        order = dict.fromkeys(("safes", "cabinets", "computers", "searchSpots", *inside))
        fact["inside"] = {key: inside[key] for key in order if key in inside}
    if source.get("unlock_seconds") is not None:
        fact["unlockSeconds"] = source["unlock_seconds"]
    elif details.get("unlockSec") is not None:
        fact["unlockSeconds"] = details["unlockSec"]
    if details.get("drill"):
        fact["drillSeconds"] = details["drill"]["sec"]
    if info.get("random"):
        fact["random"] = True
    item_groups = {key: info.get(key) or [] for key in ("requirements", "keys", "refills", "relatedItems", "loot")}
    item_groups["loot"] = item_groups["loot"] or details.get("found", [])
    item_groups["refills"] = item_groups["refills"] or details.get("charge", [])
    if drill := details.get("drill"):
        item_groups["requirements"] = [*item_groups["requirements"], dict(item_id=drill["item"], name="")]
    access_ids = set()
    for key, items in item_groups.items():
        entries = []
        seen = set()
        for item in items:
            item_id = index.match(item)
            if item_id is None or item_id in seen or (key == "relatedItems" and item_id in access_ids):
                continue
            seen.add(item_id)
            row = dict(item=item_id)
            for source_key, field in (("quantity_min", "min"), ("quantity_max", "max"), ("points", "points"),
                                      ("opens", "opens"), ("chance", "chance"), ("probability", "probability")):
                if item.get(source_key) is not None:
                    row[field] = item[source_key]
            if key != "refills" and isinstance(price := item.get("sell_price", item.get("sell")), (int, float)):
                row["sellPrice"] = price
            entries.append(row)
        if key in ("requirements", "keys", "refills"):
            access_ids.update(seen)
        if entries and key == "loot":
            pool_key = json.dumps(entries, separators=(",", ":"), sort_keys=True)
            fact["lootPool"] = pools.setdefault(pool_key, len(pools))
        elif entries:
            fact[key] = entries
    if "facts" in info:
        inside_labels = {"searchSpots": "Search spots"}
        represented = {inside_labels.get(key, key.capitalize()) for key in fact.get("inside", {})}
        represented.update(("Map", "District"))
        if "unlockSeconds" in fact:
            represented.add("Unlock time")
        if "drillSeconds" in fact:
            represented.add("Drill time")
        facts = {row["label"]: row["value"] for row in info["facts"]
                 if row["label"] not in represented}
        if facts:
            fact["facts"] = facts
    return fact


def source_position(map_id, source, bounds):
    x, y = source["x"], source["y"]
    if map_id == "world":
        return (bounds["minX"] + (bounds["maxX"]-bounds["minX"])*x/2048,
                bounds["minY"] + (bounds["maxY"]-bounds["minY"])*y/2048)
    if map_id == "settlement":
        # Three parking positions and the tax point align to the same image origin.
        return 156+2*x, 156+2*y
    if map_id == "looty-bay":
        return (x+700)*3, (725-y)*3
    if map_id == "prison":
        return (x+170)*3, (105-y)*3
    if map_id == "lennys-motel":
        return (x+245)*3, (245-y)*3
    return (x+665)*2, (665-y)*2


def marker_matches(map_id, metadata, supplied):
    authored = metadata["locations"]
    bounds = metadata["bounds"]
    local = [row for row in authored if "referenceCoordinates" in row]
    by_position = defaultdict(list)
    by_name = defaultdict(list)
    for row in local:
        pos = row["referenceCoordinates"]
        by_position[(pos["x"], pos["y"])].append(row)
        by_name[slug(row["name"])].append(row)
    used = set()
    added = Counter()
    for source in supplied:
        kind = source["subcategory_key"]
        info = source["info"]
        origin = (source["x"], source["y"])
        candidates = list(by_position.get(origin, ())) if map_id not in ("world", "settlement") else []
        category = KIND_CATEGORY.get(kind, kind)
        target_name = info["name"]
        if map_id == "world":
            target_name = re.sub(r" settlement (\d+)$", r" #\1", target_name)
            if target_name.endswith(" headquarters"):
                district = target_name.removesuffix(" headquarters")
                candidates = [row for row in authored if row["category"] == "district" and row["name"] == district]
        if map_id == "settlement":
            category = {"Parking": "parking", "Tax point": "service", "Settlement exit": "travel"}.get(target_name, "plot")
            x, y = source_position(map_id, source, bounds)
            candidates = [row for row in local if row["category"] == category
                          and math.hypot(row["x"]-x, row["y"]-y) < 200]
        if not candidates:
            candidates = by_name[slug(target_name)]
        if not candidates and map_id == "sales-center" and kind == "door":
            candidates = [row for row in local if row["category"] == "door"
                          and math.hypot(row["referenceCoordinates"]["x"]-origin[0],
                                         row["referenceCoordinates"]["y"]-origin[1]) <= .05]
        if not candidates and map_id == "looty-bay" and source["category_key"] == "buildings":
            candidates = [
                row for row in local if row["category"] == "robbery"
                and math.hypot(row["referenceCoordinates"]["x"]-origin[0],
                               row["referenceCoordinates"]["y"]-origin[1]) <= 15
            ]
        is_building = source["category_key"] == "buildings"
        candidates = [row for row in candidates if row["id"] not in used
                      and (not is_building or row["category"] == "robbery")]
        if not candidates:
            added[kind] += 1
            x, y = source_position(map_id, source, bounds)
            if not (bounds["minX"] <= x <= bounds["maxX"] and bounds["minY"] <= y <= bounds["maxY"]):
                raise ValueError(f"Reference marker outside {map_id}: {origin}")
            category = category if category in ("safe", "door", "parking", "plot", "service", "travel") else (
                "vendor" if kind in ("trader", "middleman") else "landmark")
            region = info.get("district") or metadata["displayName"]
            extra = dict(id="codex-"+source["id"], name=info["name"], category=category, subtype=kind,
                         x=round(x, 2), y=round(y, 2), label="", region=region, regionId=slug(region))
            if map_id not in ("world", "settlement"):
                extra["referenceCoordinates"] = dict(x=origin[0], y=origin[1])
            yield extra["id"], source, extra
            continue
        x, y = source_position(map_id, source, bounds)
        row = min(candidates, key=lambda candidate: (
            candidate["category"] != category and not (kind == "safe" and candidate["category"].endswith("-safe")),
            math.hypot(candidate["x"]-x, candidate["y"]-y),
        ))
        used.add(row["id"])
        yield row["id"], source, None
    print(map_id, "local", len(authored), "source", len(supplied), "joined", len(used),
          "source-only", dict(added))


def marker_fields(point, source, buildings, loot_pools, detail, index):
    info = source["info"] if source else {}
    original = point["name"]
    parent_id = detail.get("parent", {}).get("id") if detail else point.get("locationParentId")
    parent = buildings.get(parent_id)
    description_kind = "plot" if point["category"] == "plot" else info.get("kind")
    description = {}
    if info.get("description") and not point.get("description") and description_kind in MARKER_DESCRIPTION_KINDS:
        description["descriptionKey"] = f"robRun.location.usage.{description_kind}"
    if point["category"] == "robbery" and source:
        return dict(name=info["name"], lookupNames=[original], locationContext=info.get("district"),
                    filterCategoryId="building-" + source["subcategory_key"].replace("_", "-"), **description)
    if point["category"] == "settlement" and info.get("district"):
        return dict(lookupNames=[info["name"]], locationContext=info["district"], relatedMapId="settlement", **description)
    if point["category"] == "district" and info.get("district"):
        return dict(lookupNames=[info["name"]], locationContext=info["district"], **description)
    short = original.split(" · ")[-1] if parent else original
    if not SHORT_MARKER_NAMES.get(short) and "safe" in point["category"] and point.get("requiredItemId"):
        name = short
    else:
        name = SHORT_MARKER_NAMES.get(info.get("name"), info.get("name")) or SHORT_MARKER_NAMES.get(short, short)
    names = list(dict.fromkeys(value for value in (
        original, f"{parent} {name}" if parent else None,
        f"{info['building']} {name}" if info.get("building") and info["building"] != parent else None,
    ) if value and value != name))
    fields = dict(name=name, lookupNames=names, **description)
    if detail and detail["kind"] in LOOT_ART_KINDS and "lootPool" in detail:
        loot = [index.by_id[row["item"]] for row in loot_pools[detail["lootPool"]]]
        representative = next((item["icon"] for item in loot if item.get("weapon") and item.get("icon")), None)
        representative = representative or next((item["icon"] for item in loot if item.get("icon")), None)
        if representative:
            fields["iconPath"] = representative
    if point.get("label") in SHORT_MARKER_NAMES:
        fields["label"] = SHORT_MARKER_NAMES[point["label"]]
    if source or parent:
        fields["locationContext"] = parent or info.get("district")
    return fields


def marker_parent(row, buildings, heist_ids):
    label = row.get("building_name") or row["info"].get("building")
    if not label:
        return None
    if label in buildings:
        return buildings[label]
    # Some child records retain a building's old name. Their guide identifies
    # the same building by its stable heist ID.
    for link in row["info"].get("links", []):
        match = re.fullmatch(r"/en/heists/([a-z0-9-]+)/", link["href"])
        if match and match[1] in heist_ids:
            return heist_ids[match[1]]
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("--public", type=Path, default=Path(__file__).resolve().parents[1] / "public")
    parser.add_argument("--maps-only", action="store_true", help="Regenerate map data using the existing item catalog")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    items = args.public / "data/rob-run"
    index = ItemIndex(load(items / "items.json")["items"])
    if args.maps_only:
        for item_id, fact in load(items / "codex-items.json")["items"].items():
            index.ids.setdefault(fact["sourceId"], item_id)
    else:
        native_economy = load(items / "economy.json")
        fact_items, fact_cargo, source_count = read_item_facts(args.cache, index, native_economy["cargo"])
        write(items / "codex-items.json", dict(items=fact_items, cargo=fact_cargo))
        print("items and cargo", len(fact_items) + len(fact_cargo), "/", source_count,
              "weapons", sum("weapon" in row for row in fact_items.values()))
        extra_economy = read_barters(args.cache, index, native_economy["barters"])
        extra_economy["shipments"] = read_shipment_metadata(args.cache, index, native_economy["shipments"])
        write(items / "codex-economy.json", extra_economy)
    search_path = args.public / "data/map-search/index.json"
    search = load(search_path)
    search["locations"] = [entry for entry in search["locations"] if not entry["point"]["id"].startswith("codex-")]
    search_by_marker = {(entry["mapId"], entry["point"]["id"]): entry for entry in search["locations"]}
    for map_id, source_id in MAPS.items():
        root = args.public / "maps" / map_id
        data = read_map(source_id, args.cache)
        metadata = load(root / "metadata.json")
        pools = {}
        markers = {}
        locations = []
        buildings = {}
        heist_ids = {}
        matched = {}
        for marker_id, row, extra in marker_matches(map_id, metadata, data["markers"]):
            markers[marker_id] = marker_facts(row, index, pools)
            matched[marker_id] = row
            if row["category_key"] == "buildings":
                buildings[row["info"]["name"]] = marker_id
                if row.get("heistId"):
                    heist_ids[row["heistId"]] = marker_id
            if extra:
                locations.append(extra)
                search["locations"].append(dict(mapId=map_id, mapName=metadata["displayName"], point=extra, count=1))
        extras_by_id = {row["id"]: row for row in locations}
        building_aliases = defaultdict(set)
        for marker_id, row in matched.items():
            if parent := marker_parent(row, buildings, heist_ids):
                kind = row["subcategory_key"]
                markers[marker_id]["parent"] = dict(id=parent, category=KIND_CATEGORY.get(kind, kind))
                label = row.get("building_name") or row["info"].get("building")
                if label != matched[parent]["info"]["name"]:
                    building_aliases[parent].add(label)
                if marker_id in extras_by_id:
                    extras_by_id[marker_id]["locationParentId"] = parent
        building_names = {row["id"]: matched[row["id"]]["info"]["name"] if row["id"] in matched else row["name"]
                          for row in metadata["locations"] + locations if row["category"] == "robbery"}
        fields = {}
        loot_pools = [json.loads(key) for key in pools]
        for point in metadata["locations"] + locations:
            marker_id = point["id"]
            patch = marker_fields(point, matched.get(marker_id), building_names, loot_pools, markers.get(marker_id), index)
            if aliases := building_aliases.get(marker_id):
                patch["lookupNames"] = list(dict.fromkeys([*patch.get("lookupNames", []), *sorted(aliases)]))
            if point in locations:
                point.update(patch)
                continue
            fields[marker_id] = patch
            entry = search_by_marker.get((map_id, marker_id))
            if entry:
                entry["point"].update(patch)
                entry["names"] = [patch.get("name", point["name"]), *patch.get("lookupNames", [])]
        write(root / "codex-details.json", dict(points=markers, lootPools=loot_pools))
        write(root / "codex-locations.json", dict(locations=locations, locationFields=fields))
    write(search_path, search)


if __name__ == "__main__":
    main()
