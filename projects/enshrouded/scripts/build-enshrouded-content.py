"""Prepare the audited wiki snapshot for the app's public content roots."""

from __future__ import annotations

import json
import hashlib
import re
import shutil
import sys
from urllib.parse import unquote
from pathlib import Path

from PIL import Image
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "research" / "enshrouded-wiki"
MAP = ROOT / "public" / "maps" / "enshrouded"
DATA = ROOT / "public" / "data" / "enshrouded"


def read(name: str):
    return json.loads((SOURCE / name).read_text(encoding="utf-8"))


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def copy_asset(source_path: str, destination: Path):
    source = SOURCE / source_path
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def asset_name(source_path: str) -> str:
    name = Path(source_path).name
    # A literal "%2C" in a URL path is decoded to "," by browsers and
    # servers, so a copied file with that literal name cannot be served.
    if "%" in name:
        digest = hashlib.sha256(source_path.encode("utf-8")).hexdigest()[:20]
        return f"{digest}{Path(name).suffix.lower()}"
    return name


def plain_wikitext(value: str) -> str:
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"\[\[(?:File|Category):[^\]]*\]\]", "", value, flags=re.I)
    value = re.sub(r"\[\[[a-z]{2,3}:[^\]]*\]\]", "", value, flags=re.I)
    value = re.sub(r"\[\[(?:[^]|]*\|)?([^]]+)\]\]", r"\1", value)
    value = re.sub(r"'''?|<[^>]+>", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def related_summary(source: str) -> tuple[str | None, str | None]:
    body = re.split(r"\n==[^=]", source, maxsplit=1)[0]
    lines = [plain_wikitext(line) for line in body.splitlines() if line.strip()
             and not line.lstrip().startswith(("{{", "|", "}}", "[[Category:", "[[fr:"))]
    intro = next((line for line in lines if len(line) > 25), None)
    if not intro:
        description = re.search(r"^\s*\|\s*description\s*=\s*(.+)$", source, re.I | re.M)
        intro = plain_wikitext(description.group(1)) if description else None
    match = re.search(r"==\s*Obtaining\s*==\s*(.*?)(?=\n==|\Z)", source, re.I | re.S)
    obtaining = plain_wikitext(match.group(1)) if match else None
    return intro, obtaining[:1000] if obtaining else None


def build_catalog():
    raw = read("building-catalog-ready.json")
    related = read("related-pages.json")["pages"]
    records = []
    for item in raw["records"]:
        record = dict(item)
        for key in ("icon", "appearance"):
            if record.get(key) and record[key].get("path"):
                filename = asset_name(record[key]["path"])
                copy_asset(record[key]["path"], DATA / "images" / filename)
                record[key] = {**record[key], "path": f"data/enshrouded/images/{filename}"}
        records.append(record)
    existing = {entry["sourcePage"].casefold() for entry in records}
    extra = []
    for name, page in related.items():
        if page.get("missing") or name.casefold() in existing:
            continue
        intro, obtaining = related_summary(page.get("sourceWikitext", ""))
        extra.append({"id": name.replace(" ", "_"), "name": name,
                      "sourceCatalog": "Related Pages", "group": "related-pages",
                      "set": None, "type": page.get("type"), "rarity": None,
                      "stackSize": None, "level": None, "biomes": None,
                      "description": page.get("description") or intro,
                      "obtainingText": obtaining, "availability": None,
                      "recipe": {"status": "not-listed", "ingredients": [], "workstations": [],
                                 "craftTime": None, "products": []},
                      "recipeReview": None, "icon": None, "appearance": None,
                      "sourcePage": name, "sourceRevision": page.get("revision")})
    write(DATA / "building-catalog.json", {"schemaVersion": 1,
          "source": "Enshrouded Wiki snapshot, 2026-10-15", "catalogs": raw["catalogs"],
          "records": records, "relatedRecords": extra})
    write(DATA / "building-page-index.json", [entry["sourcePage"] for entry in records + extra])
    print(f"Catalog: {len(records)} materials, {len(extra)} related pages")


def build_tiles(tiles):
    size = 1280
    levels = []
    current = {}
    for tile in tiles:
        column, row = map(int, tile["name"].removesuffix(".jpg").split("_"))
        current[(column, row)] = SOURCE / tile["path"]
    for level in range(4):
        levels.append(level)
        next_level = {}
        for (column, row), source in current.items():
            destination = MAP / "tiles" / str(level) / f"tile{column}x{row}.webp"
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as image:
                image.convert("RGB").save(destination, "WEBP", quality=85, method=5)
            next_level[(column // 2, row // 2)] = None
        if level == 3:
            break
        generated = {}
        for column, row in next_level:
            canvas = Image.new("RGB", (size * 2, size * 2), (23, 35, 33))
            for dx in (0, 1):
                for dy in (0, 1):
                    tile = current.get((column * 2 + dx, row * 2 + dy))
                    if tile:
                        with Image.open(tile) as part:
                            # Wiki tiles can contain 2x pixels for the same world bounds.
                            # Normalize before stitching; pasting them at native size clips
                            # and overlaps neighboring map regions in the overview levels.
                            canvas.paste(part.convert("RGB").resize((size, size), Image.Resampling.LANCZOS),
                                         (dx * size, dy * size))
            destination = MAP / "tiles" / str(level + 1) / f"tile{column}x{row}.webp"
            destination.parent.mkdir(parents=True, exist_ok=True)
            canvas.resize((size, size), Image.Resampling.LANCZOS).save(destination, "WEBP", quality=85, method=5)
            generated[(column, row)] = destination
        current = generated
    return levels


def apply_map_corrections(locations, groups, material_locations, corrections=None):
    """Apply reviewed native evidence without modifying the upstream wiki snapshot."""
    if corrections is None:
        corrections = json.loads((DATA / "map-source-corrections.json").read_text(encoding="utf-8"))
    by_id = {point["id"]: point for point in locations}
    if len(by_id) != len(locations):
        raise ValueError("Duplicate map marker IDs before corrections")
    for change in corrections["markerUpdates"]:
        point = by_id[change["id"]]
        for key, before in change["before"].items():
            if point.get(key) != before and point.get(key) != change["after"][key]:
                raise ValueError(f"Source changed for {change['id']}.{key}; reverify the correction")
        point.update(change["after"])
    groups.update(corrections["groupOverrides"])
    for addition in corrections["additionalMarkers"]:
        existing = by_id.get(addition["id"])
        if existing is not None:
            if existing != addition:
                raise ValueError(f"Source now defines {addition['id']}; reconcile the native addition")
        else:
            locations.append(dict(addition))
            by_id[addition["id"]] = locations[-1]
        for page in addition.get("relatedPages", []):
            links = material_locations.setdefault(page["page"], [])
            if not any(link["id"] == addition["id"] for link in links):
                links.append({"id": addition["id"], "name": addition["name"]})
    for point in locations:
        if point["subtype"] in corrections["groupOverrides"]:
            point["iconPath"] = groups[point["subtype"]]["icon"]
    return corrections


def merge_corrected_wiki_links(corrections):
    path = DATA / "wiki-map-links.json"
    links = json.loads(path.read_text(encoding="utf-8"))
    for page, marker_ids in corrections["wikiMapLinks"].items():
        links[page] = list(dict.fromkeys([*links.get(page, []), *marker_ids]))
    path.write_text(json.dumps(links, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apply_existing_map_corrections():
    metadata = json.loads((MAP / "metadata.json").read_text(encoding="utf-8"))
    groups = json.loads((DATA / "map-groups.json").read_text(encoding="utf-8"))
    material_locations = json.loads((DATA / "material-locations.json").read_text(encoding="utf-8"))
    corrections = apply_map_corrections(metadata["locations"], groups, material_locations)
    write(MAP / "metadata.json", metadata)
    write(DATA / "map-groups.json", groups)
    write(DATA / "material-locations.json", material_locations)
    merge_corrected_wiki_links(corrections)
    print(f"Corrected map: {len(metadata['locations'])} markers, {len(groups)} groups")


def build_map(rebuild_tiles: bool = True):
    raw = read("map-catalog-ready.json")
    levels = build_tiles(raw["tiles"]) if rebuild_tiles else [0, 1, 2, 3]
    groups = {}
    for key, group in raw["groups"].items():
        icon = group.get("icon")
        if icon:
            filename = asset_name(icon)
            copy_asset(icon, MAP / "marker-icons" / filename)
        groups[key] = {**group, "icon": f"maps/enshrouded/marker-icons/{filename}" if icon else None}
    locations = []
    material_locations: dict[str, list[dict[str, str]]] = {}
    known_pages = {entry["sourcePage"].casefold(): entry["sourcePage"]
                   for entry in read("building-catalog-ready.json")["records"]}
    known_pages.update({name.casefold(): name for name, page in read("related-pages.json")["pages"].items()
                        if not page.get("missing")})
    for marker in raw["markers"]:
        photo = marker.get("panelImage")
        if photo:
            filename = asset_name(photo)
            copy_asset(photo, MAP / "marker-photos" / filename)
        related_pages = []
        for anchor in BeautifulSoup(marker.get("descriptionHtml") or "", "html.parser").find_all("a", href=True):
            if "/wiki/" not in anchor["href"] or "redlink=1" in anchor["href"]:
                continue
            page = unquote(anchor["href"].split("/wiki/")[-1].split("?")[0]).replace("_", " ")
            if page.casefold() in known_pages:
                related_pages.append({"page": known_pages[page.casefold()], "label": anchor.get_text(" ", strip=True)})
        article = marker.get("article")
        article_page = known_pages.get(article.casefold()) if article else None
        for page in sorted(set([link["page"] for link in related_pages] + ([article_page] if article_page else []))):
            material_locations.setdefault(page, []).append({"id": marker["id"], "name": marker["name"]})
        locations.append({"id": marker["id"], "name": marker["name"],
                          "category": f"wiki-{marker['group'].lower()}",
                          "label": groups[marker["group"]]["name"],
                          "subtype": marker["group"], "regionId": "embervale",
                          "region": "Embervale", "x": marker["x"],
                          "y": 10240 - marker["y"],
                          "referenceCoordinates": {"x": marker["x"], "y": marker["y"]},
                          "description": marker.get("description"),
                          "relatedPages": related_pages,
                          "iconPath": groups[marker["group"]]["icon"],
                          "artworkPath": f"maps/enshrouded/marker-photos/{filename}" if photo else None,
                          "wikiArticle": marker.get("article"),
                          "sourceLayers": marker.get("presentOn", [])})
    corrections = apply_map_corrections(locations, groups, material_locations)
    write(MAP / "metadata.json", {"schemaVersion": 1, "displayName": "Embervale",
          "description": "Enshrouded Wiki map snapshot, 2026-10-15",
          "attribution": "Map data and artwork: Enshrouded Wiki; game assets: Keen Games GmbH",
          "bounds": {"minX": 0, "minY": 0, "maxX": 10240, "maxY": 10240},
          "tileSize": 1280, "detailLevels": levels,
          "tileCoverage": [[f"{x},{y}" for x in range(8 // (2 ** level))
                            for y in range(8 // (2 ** level))] for level in levels],
          "tilePattern": "tiles/{level}/tile{x}x{y}.webp",
          "backgroundColor": "#172321", "regions": [], "locations": locations})
    write(DATA / "map-groups.json", groups)
    write(DATA / "material-locations.json", material_locations)
    merge_corrected_wiki_links(corrections)
    print(f"Map: {len(locations)} markers, {len(groups)} groups, {len(levels)} tile levels")


if __name__ == "__main__":
    if "--corrections-only" in sys.argv:
        apply_existing_map_corrections()
    else:
        build_catalog()
        if "--catalog-only" not in sys.argv:
            build_map(rebuild_tiles="--metadata-only" not in sys.argv)
