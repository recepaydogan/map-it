"""Build the bundled Bestiary catalog and map layer from source snapshots.

Run extract-enshrouded-bestiary.py first. Native template matches below are
curated; a similar-sounding template is deliberately not sufficient evidence.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research" / "enshrouded-bestiary"
PUBLIC = ROOT / "public" / "data" / "enshrouded"
MAPS = ROOT / "public" / "maps" / "enshrouded"
API = "https://enshrouded.wiki.gg/api.php"
PREFIX = "Spawnpoint_"

# Only templates with a clear species/role match, or bosses independently
# corroborated by a wiki MapLink at the same point, are pinned.
MATCHES = {
    "Fell Footsoldier": [r"(?:POI|Trigger)_Enemy_Fogger_Soldier_T[1-4](?:_.*)?"],
    "Fell Berserker": [r"(?:POI|Trigger)_Enemy_Fogger_Heavy_Berserker"],
    "Fell Ranger": [r"(?:POI|Trigger)_Enemy_Fogger_Ranger_T[1-4](?:_T2)?"],
    "Fell Banshee": [r"(?:POI|Trigger)_Enemy_Fogger_Mage_Banshee(?:_Elite)?"],
    "Fell Sporehead": [r"(?:POI|Trigger)_Enemy_Fogger_Mage_Spore[Hh]ead"],
    "Fell Knight": [r"(?:POI|Trigger)_Enemy_Fogger_Melee_Shield_Elite_T[24]"],
    "Fell Critter": [r"POI_Wildbeast_Fog_Critter_Bug(?:_Hover)?"],
    "Exploding Fell Critter": [r"POI_Wildbeast_Fog_Critter_Suicider"],
    "Fell Boar": [r"POI_Wildbeast_Boar_Fog"],
    "Fell Mushroom Crab": [r"POI_Wildbeast_Fog_Mushroom_Giant"],
    "Shroud Gazer": [r"(?:POI|Trigger)_Wildbeast_(?:Fog_)?Critter_Hover_Ranger_Elite"],
    "Shroud Stalker": [r"POI_Wildbeast_Fog_Predator(?:_BossHealthBar)?"],
    "Shroud Depthdweller": [r"POI_Wildbeast_Fog_Jelly_(?:M|XL)"],
    "Fell Draconian Vulture": [r"POI_Wildbeast_Vulture_Fog(?:_roaming)?"],
    "Fell Thunderbrute": [r"POI_Enemy_Fogger_Heavy(?:_Berserker|_unarmored)?_BossHealthBar"],
    "Fell Critter Queen": [r"POI_Wildbeast_Fog_Critter_Queen_T[234](?:_BossHealthBar)?"],
    "Fell Monstrosity": [r"POI_Enemy_Fogger_Monstrosity(?:_BossHealthBar)?"],
    "Fell Wispwyvern": [r"Enemy_Boss_GiantLizard"],
    "Fell Cyclops": [r"POI_Wildbeast_Cyclops_fog"],
    "Fell Dragon Youngling": [r"Trigger_Boss_FogDragon"],
    "Scavenger Scalper": [r"(?:POI|Trigger)_Enemy_Scavenger_Melee"],
    "Scavenger Scrapgun": [r"(?:POI|Trigger)_Enemy_Scavenger_Ranger_Cannon"],
    "Scavenger Berserker": [r"POI_Enemy_Scavenger_Melee_Elite"],
    "Scavenger Matron": [r"POI_Enemy_Scavenger_Mage_Heavy_Hounds(?:_BossHealthBar)?"],
    "Scavenger Gorger": [r"POI_Enemy_Scavenger_Mage_Heavy_Acid(?:_BossHealthBar)?"],
    "Scavenger Tyrant": [r"POI_Enemy_Scavenger_ColdHeights_Tyron_HeavySupport_BossHealthBar"],
    "Vukah Warrior": [r"(?:POI|Trigger)_Enemy_Vukah_Melee"],
    "Vukah Ranger": [r"(?:POI|Trigger)_Enemy_Vukah_Ranger"],
    "Vukah Shaman": [r"(?:POI|Trigger)_Enemy_Vukah_Shaman_(?:Healing|Lightning)"],
    "Vukah Berserker": [r"POI_Enemy_Vukah_Melee_Elite"],
    "Vukah Brawler": [r"POI_Enemy_Vukah_MidBoss_(?:BigFoot|BossHealthBar|Variant_Caster_BossHealthBar)"],
    "Hollow Skeleton": [r"(?:POI|Trigger)_Enemy_Skeleton_(?:Dungeon_)?Weakling_01"],
    "Hollow Soldier": [r"(?:POI|Trigger)_Enemy_Skeleton_(?:Dungeon_)?Melee_01"],
    "Hollow Mage": [r"(?:POI|Trigger)_Enemy_Skeleton_(?:Dungeon_)?Mage_01"],
    "Hollow Reaper": [r"(?:POI|Trigger)_Enemy_Skeleton_(?:Dungeon_)?Elite_01"],
    "Hollow Hound": [r"(?:POI|Trigger)_Enemy_Skeleton_(?:Dungeon_)?Dog_01"],
    "Drak Warrior": [r"(?:POI|Trigger)_Enemy_Drak_Wetland_Melee_Spear"],
    "Drak Skirmisher": [r"(?:POI|Trigger)_Enemy_Drak_Wetland_Ranger"],
    "Drak Priest": [r"(?:POI|Trigger)_Enemy_Drak_Wetland_Mage"],
    "Drak Chieftan": [r"POI_Enemy_Drak_Wetland_Heavy"],
    "Hydrak'Dal": [r"POI_Enemy_Drak_Wetland_Heavy_bossHealthbar"],
}
BOSSES = {
    "Fell Thunderbrute", "Fell Critter Queen", "Fell Sicklescythe", "Fell Monstrosity",
    "Fell Wispwyvern", "Fell Cyclops", "Fell Dragon Youngling",
    "Scavenger Matron", "Scavenger Gorger", "Scavenger Tyrant",
    "Vukah Brawler", "Hollow Cyclops", "Hydrak'Dal",
}


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def template_at(text: str, start: int) -> tuple[str, int]:
    depth = 0
    position = start
    while position < len(text) - 1:
        pair = text[position:position + 2]
        if pair == "{{":
            depth += 1
            position += 2
        elif pair == "}}":
            depth -= 1
            position += 2
            if depth == 0:
                return text[start + 2:position - 2], position
        else:
            position += 1
    return "", start


def top_level_parts(text: str) -> list[str]:
    parts = []
    depth = 0
    start = 0
    position = 0
    while position < len(text):
        pair = text[position:position + 2]
        if pair == "{{":
            depth += 1
            position += 2
        elif pair == "}}":
            depth -= 1
            position += 2
        elif text[position] == "|" and depth == 0:
            parts.append(text[start:position].strip())
            start = position + 1
            position += 1
        else:
            position += 1
    parts.append(text[start:].strip())
    return parts


def templates(text: str, name: str) -> list[list[str]]:
    result = []
    for match in re.finditer(r"\{\{" + re.escape(name) + r"(?=[\s|}])", text, re.I):
        body, end = template_at(text, match.start())
        if end > match.start():
            result.append(top_level_parts(body))
    return result


def fields(parts: list[str]) -> dict[str, str]:
    return {key.strip().lower(): value.strip()
            for part in parts[1:] if "=" in part
            for key, value in [part.split("=", 1)]}


def plain(text: str) -> str:
    text = re.sub(r"\[\[(?:File|Image|Category):[^]]+\]\]", "", text, flags=re.I)
    text = re.sub(r"\[\[[^]|]+\|([^]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^]]+)\]\]", r"\1", text)
    text = re.sub(r"\[(?:https?://\S+)\s+([^]]+)\]", r"\1", text)
    for _ in range(8):
        updated = re.sub(r"\{\{[^{}]*\}\}", "", text)
        if updated == text:
            break
        text = updated
    text = re.sub(r"\{\|.*?\|\}", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"'{2,}", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .\n\t")


def parse_page(title: str, faction: str, source: dict) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    base = {
        "id": slug, "name": title, "faction": faction, "role": "boss" if title in BOSSES else "enemy",
        "wikiArticle": title, "sourceArticle": title, "sourceRevision": source.get("revision"),
        "sourceUpdatedAt": source.get("updatedAt"), "sourceMissing": "missing" in source,
        "image": None, "imageFile": None, "overview": None, "regions": [],
        "behavior": None, "resistances": [], "sections": [], "drops": [], "wikiLocations": [],
    }
    if "wikitext" not in source:
        return base
    wiki = source["wikitext"]
    infobox_match = re.search(r"\{\{NPC[ _]Infobox(?=[\s|}])", wiki, re.I)
    intro_start = 0
    info = {}
    if infobox_match:
        body, intro_start = template_at(wiki, infobox_match.start())
        info = fields(top_level_parts(body))
    image_file = info.get("images", "").split(":", 1)[0].split(",", 1)[0].strip()
    if image_file:
        image_file = image_file.replace("{{PAGENAME}}", title).replace("{{Pagename}}", title)
        base["imageFile"] = image_file
    base["regions"] = [part.strip() for part in info.get("region", "").split(",") if part.strip()]
    base["behavior"] = info.get("behavior")
    for key in ("cutting", "piercing", "blunt", "poison", "fire", "ice", "shroud", "shock"):
        if info.get(key):
            base["resistances"].append({"damageType": key.title(), "effectiveness": plain(info[key])})
    headings = list(re.finditer(r"^\s*=+\s*([^=\n]+?)\s*=+\s*$", wiki, re.M))
    intro_end = headings[0].start() if headings else len(wiki)
    overview = plain(wiki[intro_start:intro_end])
    base["overview"] = overview or plain(info.get("description", "")) or None
    for index, heading in enumerate(headings):
        section_title = heading.group(1).strip()
        section_end = headings[index + 1].start() if index + 1 < len(headings) else len(wiki)
        raw_section = wiki[heading.end():section_end]
        section_items = [plain(match.group(1)) for match in
                         re.finditer(r"(?m)^\s*[*#]+\s*(.+)$", raw_section)]
        section_items = [item for item in section_items if item]
        section_text = plain(re.sub(r"(?m)^\s*[*#]+\s*.+$", "", raw_section))
        if section_title.lower() in {"see also", "loot", "drops", "unique drops", "locations"}:
            continue
        if section_text or section_items:
            base["sections"].append({"title": section_title, "text": section_text,
                                     "items": section_items})
    seen_drops = set()
    for parts in templates(wiki, "ItemsLine"):
        item = fields(parts)
        name = plain(item.get("item", ""))
        if not name:
            continue
        drop = {"name": name, "quantity": plain(item.get("quantity", "")) or None,
                "type": plain(item.get("type", "")) or None,
                "source": plain(item.get("source", "")) or None}
        key = (name, drop["quantity"], drop["source"])
        if key not in seen_drops:
            base["drops"].append(drop)
            seen_drops.add(key)
    seen_locations = set()
    for index, heading in enumerate(headings):
        if heading.group(1).strip().lower() != "locations":
            continue
        section_end = headings[index + 1].start() if index + 1 < len(headings) else len(wiki)
        location_text = wiki[heading.end():section_end]
        rows = re.split(r"(?m)^\s*\|-", location_text)[1:]
        for row in rows if rows else [location_text]:
            links = templates(row, "MapLink")
            if not links:
                continue
            positional = [part for part in links[0][1:] if "=" not in part]
            if not positional:
                continue
            marker_id = positional[0].strip()
            label = positional[1].strip() if len(positional) > 1 else marker_id
            if marker_id not in seen_locations:
                base["wikiLocations"].append({"markerId": marker_id, "label": plain(label)})
                seen_locations.add(marker_id)
    return base


def image_urls(records: list[dict]) -> dict[str, str]:
    cache_path = RESEARCH / "image-urls.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    filenames = sorted({record["imageFile"] for record in records if record["imageFile"]})
    canonical_names = {name.replace("_", " ").casefold(): name for name in filenames}
    urls = {}
    for start in range(0, len(filenames), 50):
        batch = filenames[start:start + 50]
        response = requests.get(API, params={"action": "query", "prop": "imageinfo",
            "iiprop": "url", "titles": "|".join("File:" + name for name in batch),
            "format": "json", "formatversion": 2}, timeout=45)
        response.raise_for_status()
        result = response.json()
        if "error" in result:
            raise RuntimeError(result["error"])
        for page in result["query"]["pages"]:
            info = page.get("imageinfo", [])
            if info:
                name = canonical_names.get(page["title"].removeprefix("File:").replace("_", " ").casefold())
                if name:
                    urls[name] = info[0]["url"]
    write(cache_path, urls)
    return urls


def save_image(pair: tuple[str, str]) -> tuple[str, str | None]:
    filename, url = pair
    digest = hashlib.sha256(filename.encode()).hexdigest()[:12]
    target = PUBLIC / "bestiary-images" / f"{digest}.webp"
    if target.exists():
        return filename, f"data/enshrouded/bestiary-images/{target.name}"
    try:
        time.sleep(0.8)
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        if not response.headers.get("content-type", "").startswith("image/"):
            return filename, None
        image = Image.open(BytesIO(response.content))
        image.thumbnail((400, 400))
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=85)
        return filename, f"data/enshrouded/bestiary-images/{target.name}"
    except (requests.RequestException, OSError):
        return filename, None


def main() -> None:
    wiki = json.loads((RESEARCH / "wiki-source.json").read_text(encoding="utf-8"))
    native = json.loads((RESEARCH / "native-spawns.json").read_text(encoding="utf-8"))
    records = [parse_page(title, faction, wiki["pages"].get(title, {"missing": True}))
               for faction, titles in wiki["factions"].items() for title in titles]
    matron = next(record for record in records if record["name"] == "Scavenger Matron")
    gorger = next(record for record in records if record["name"] == "Scavenger Gorger")
    gorger.update({
        "sourceMissing": False, "sourceArticle": "Scavenger Matron",
        "sourceRevision": matron["sourceRevision"], "sourceUpdatedAt": matron["sourceUpdatedAt"],
        "imageFile": matron["imageFile"], "regions": matron["regions"],
        "overview": "The Gorger is a Scavenger Matron variant that throws poison in three directions.",
        "drops": matron["drops"],
    })
    hydrak = next(record for record in records if record["name"] == "Hydrak'Dal")
    hydrak.update({
        "sourceMissing": False, "sourceArticle": "Hydrak'Dal Head",
        "regions": ["Veilwater Basin"],
        "overview": "Hydrak'Dal is a Drak'Dal tribe leader in the Veilwater Basin.",
        "drops": [{"name": "Hydrak'Dal Head", "quantity": None,
                   "type": "Materials", "source": "Drop"}],
    })
    catalog_path = PUBLIC / "bestiary-catalog.json"
    prior_images = {item["name"]: item["image"] for item in
                    json.loads(catalog_path.read_text(encoding="utf-8"))["records"]} if catalog_path.exists() else {}
    urls = {} if "--offline" in sys.argv else image_urls(records)
    with ThreadPoolExecutor(max_workers=1) as pool:
        image_paths = dict(pool.map(save_image, urls.items()))
    for record in records:
        record["image"] = image_paths.get(record["imageFile"]) or prior_images.get(record["name"])
        del record["imageFile"]

    existing = json.loads((MAPS / "metadata.json").read_text(encoding="utf-8"))["locations"]
    existing_ids = {marker["id"] for marker in existing}
    normalized_ids = {}
    for marker in existing:
        normalized_ids.setdefault(re.sub(r"[^a-z0-9]", "", marker["id"].lower()), set()).add(marker["id"])
    for record in records:
        for location in record["wikiLocations"]:
            if location["markerId"] in existing_ids:
                continue
            candidates = normalized_ids.get(re.sub(r"[^a-z0-9]", "", location["markerId"].lower()), set())
            if len(candidates) == 1:
                location["markerId"] = next(iter(candidates))
    compiled = {name: [re.compile("^" + PREFIX + rule + "$") for rule in rules]
                for name, rules in MATCHES.items()}
    locations = []
    matched_counts = {}
    for record in records:
        rules = compiled.get(record["name"], [])
        points = [point for point in native["placements"]
                  if any(rule.fullmatch(point["template"]) for rule in rules)]
        record["nativeSpawnCount"] = len(points)
        record["nativeTemplates"] = sorted({point["template"] for point in points})
        matched_counts[record["name"]] = len(points)
        for point in points:
            marker_id = f"bestiary-{record['id']}-{point['sceneResource']}-{point['sceneEntity']}"
            if marker_id in existing_ids:
                raise RuntimeError(f"Existing marker ID collision: {marker_id}")
            locations.append({
                "id": marker_id, "name": record["name"],
                "category": "bestiary-bosses" if record["role"] == "boss"
                else f"bestiary-{record['faction'].lower()}",
                "label": record["faction"], "subtype": record["role"],
                "regionId": "embervale", "region": "Embervale",
                "x": point["x"], "y": round(10240 - point["z"], 3),
                "referenceCoordinates": {"x": point["x"], "y": point["z"]},
                "elevation": point["elevation"],
                "sourceActor": point["template"],
                "wikiArticle": record["wikiArticle"],
            })
    write(PUBLIC / "bestiary-catalog.json", {
        "schemaVersion": 1, "source": "https://enshrouded.wiki.gg/wiki/Bestiary",
        "gameBuild": native["gameBuild"], "records": records,
    })
    write(MAPS / "bestiary-locations.json", {"schemaVersion": 1, "locations": locations})
    print(f"Bestiary: {len(records)} entries, {sum(bool(record['image']) for record in records)} images")
    print(f"Map: {len(locations)} source-positioned spawn markers across {sum(bool(n) for n in matched_counts.values())} species")
    print("Unplaced:", ", ".join(name for name, count in matched_counts.items() if not count))


if __name__ == "__main__":
    main()
