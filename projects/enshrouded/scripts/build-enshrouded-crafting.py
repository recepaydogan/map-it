"""Build crafting stations, materials, and calculator data from the wiki snapshot.

Wiki pages and new images are cached under research/enshrouded-wiki/crafting.
Existing building and next-catalog images are reused before any download.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research" / "enshrouded-wiki"
SNAPSHOT = RESEARCH / "crafting"
OUTPUT = ROOT / "public" / "data" / "enshrouded"
IMAGES = OUTPUT / "crafting-images"
API = "https://enshrouded.wiki.gg/api.php"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)"})


def read(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def api(**params):
    for attempt in range(5):
        try:
            response = SESSION.get(API, params={"format": "json", "formatversion": 2, **params}, timeout=45)
            if response.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(str(response.status_code))
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except (requests.RequestException, ValueError) as error:
            if attempt == 4:
                raise RuntimeError(f"Wiki API failed: {params}") from error
            time.sleep(min(2 ** attempt, 8))
    raise AssertionError("unreachable")


def batches(values, size=30):
    values = list(values)
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def category_pages(category):
    titles = []
    continuation = {}
    while True:
        result = api(action="query", list="categorymembers", cmtitle=f"Category:{category}",
                     cmlimit="max", **continuation)
        titles.extend(entry["title"] for entry in result["query"]["categorymembers"] if entry["ns"] == 0)
        continuation = result.get("continue", {})
        if not continuation:
            return sorted(set(titles))


def cargo_recipes(cached=False):
    path = SNAPSHOT / "cargo-ingredients.json"
    if cached and path.exists():
        return read(path)
    rows = []
    fields = "RecipeID,CraftedItem,CraftedQuantity,SourceItem,SourceQuantity,Crafter,Workshop,Workshop2,CraftingTime"
    while True:
        result = api(action="cargoquery", tables="Ingredients", fields=fields,
                     limit=500, offset=len(rows))
        batch = [entry["title"] for entry in result.get("cargoquery", [])]
        rows.extend(batch)
        write(path, rows)
        print(f"Cargo ingredients: {len(rows)} rows", flush=True)
        if len(batch) < 500:
            return rows


def source_pages(titles):
    saved = read(SNAPSHOT / "pages.json", {})
    # Refresh page revisions, while preserving the cache across interrupted runs.
    for batch in batches(sorted(titles)):
        result = api(action="query", prop="revisions", rvslots="main",
                     rvprop="content|ids|timestamp", redirects="1", titles="|".join(batch))
        for page in result["query"]["pages"]:
            if "missing" in page or not page.get("revisions"):
                saved[page["title"]] = {"missing": True}
                continue
            revision = page["revisions"][0]
            saved[page["title"]] = {
                "revision": revision["revid"], "updatedAt": revision["timestamp"],
                "sourceWikitext": revision["slots"]["main"]["content"],
            }
        write(SNAPSHOT / "pages.json", saved)
    return saved


def templates(source):
    result = []
    offset = 0
    while (start := source.find("{{", offset)) >= 0:
        depth = 1
        cursor = start + 2
        while cursor < len(source) and depth:
            if source.startswith("{{", cursor):
                depth += 1
                cursor += 2
            elif source.startswith("}}", cursor):
                depth -= 1
                cursor += 2
            else:
                cursor += 1
        if depth:
            break
        body = source[start + 2:cursor - 2]
        parts = []
        part_start = 0
        inner_depth = 0
        for index, char in enumerate(body):
            if body.startswith("{{", index):
                inner_depth += 1
            elif body.startswith("}}", index):
                inner_depth -= 1
            elif char == "|" and inner_depth == 0:
                parts.append(body[part_start:index])
                part_start = index + 1
        parts.append(body[part_start:])
        fields = {}
        for part in parts[1:]:
            name, separator, value = part.partition("=")
            if separator:
                fields[name.strip().casefold()] = value.strip()
        result.append({"name": parts[0].strip().casefold(), "fields": fields})
        offset = cursor
    return result


def plain_text(source, title=None):
    if title:
        source = source.replace("{{PAGENAME}}", title).replace("{{SUBPAGENAME}}", title.rsplit("/", 1)[-1])
    source = re.sub(r"\{\{(?:Quest\+the|Quest|item\+iconright|Item\+iconright|item)\|([^{}]+)\}\}",
                    lambda match: match.group(1).split("|")[-1], source, flags=re.I)
    source = re.sub(r"\{\{[^{}]*\}\}", "", source)
    source = re.sub(r"\[\[(?:File|Category):[^]]*\]\]", "", source, flags=re.I)
    source = re.sub(r"\[\[[a-z]{2,3}:[^]]*\]\]", "", source, flags=re.I)
    source = re.sub(r"\[\[(?:[^]|]*\|)?([^]]+)\]\]", r"\1", source)
    source = re.sub(r"<[^>]+>|'{2,5}", "", source)
    return re.sub(r"\s+", " ", source).strip()


def obtaining(source, title=None):
    section = re.search(r"^==\s*Obtaining\s*==\s*(.*?)(?=^==[^=]|\Z)", source, re.I | re.M | re.S)
    if not section:
        return None
    body = re.split(r"^={3,}", section.group(1), maxsplit=1, flags=re.M)[0]
    value = plain_text(body, title)
    value = re.sub(r"\s*The Wiki's Map shows what veins each Mine and Cave Passage have, if any, when its icon is clicked on\.", "", value, flags=re.I)
    return value[:900] if value else None


def quantity(value, default=1):
    match = re.search(r"\d[\d,]*", str(value or ""))
    return max(1, int(match.group().replace(",", ""))) if match else default


def ingredients(value):
    parts = []
    for part in str(value or "").split(","):
        name, separator, count = part.strip().rpartition(":")
        if not part.strip():
            continue
        if not separator:
            name, count = part.strip(), "1"
        name = plain_text(name).strip()
        if name:
            parts.append({"name": name, "quantity": quantity(count)})
    return parts


def image_file(fields, title):
    image = fields.get("images") or fields.get("image")
    if not image:
        return None
    return image.replace("{{PAGENAME}}", title).replace("{{SUBPAGENAME}}", title.rsplit("/", 1)[-1]).strip()


def station_groups(crafting_source):
    groups = {}
    blocks = re.findall(r"^===\s*(.*?)\s*===\s*(.*?)(?=^===|\Z)", crafting_source, re.M | re.S)
    for heading, body in blocks:
        name = "Manual" if "Manual Crafting" in heading else re.findall(r"\[\[([^]|]+)", heading)[-1]
        equipment = re.search(r"\{\{Crafting Equipment\s*\|(.+?)\}\}", body, re.S)
        if equipment:
            for station in equipment.group(1).split("|"):
                groups[station.strip()] = name
    return groups


def existing_images():
    paths = {}
    building = read(OUTPUT / "building-catalog.json", {})
    for record in building.get("records", []):
        for field in ("icon", "appearance"):
            asset = record.get(field) or {}
            if asset.get("file") and asset.get("path") and (ROOT / "public" / asset["path"]).is_file():
                paths[asset["file"].replace("_", " ").casefold()] = asset["path"]
    next_assets = read(RESEARCH / "next-catalogs" / "asset-manifest.json", {})
    for name, asset in next_assets.items():
        path = RESEARCH / "next-catalogs" / asset["path"]
        if path.is_file():
            paths.setdefault(name.replace("_", " ").casefold(), path)
    return paths


def image_urls(names):
    saved = read(SNAPSHOT / "image-info.json", {})
    pending = sorted(set(names) - set(saved))
    for batch in batches(pending, 15):
        result = api(action="query", prop="imageinfo", iiprop="url|size|mime",
                     titles="|".join(f"File:{name}" for name in batch))
        for page in result["query"]["pages"]:
            name = page["title"].removeprefix("File:")
            info = page.get("imageinfo", [{}])[0]
            saved[name] = {"url": info.get("url"), "bytes": info.get("size"), "mime": info.get("mime")}
        write(SNAPSHOT / "image-info.json", saved)
    return saved


def copy_images(names, known):
    resolved = {}
    unresolved = [name for name in sorted(set(names)) if name.replace("_", " ").casefold() not in known]
    infos = image_urls(unresolved)
    manifest = read(SNAPSHOT / "asset-manifest.json", {})
    for name in sorted(set(names)):
        known_path = known.get(name.replace("_", " ").casefold())
        if isinstance(known_path, str):
            resolved[name] = known_path
            continue
        suffix = Path(name).suffix.lower()
        if suffix not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            continue
        filename = hashlib.sha256(name.encode("utf-8")).hexdigest()[:20] + suffix
        target = IMAGES / filename
        if isinstance(known_path, Path):
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.is_file():
                shutil.copyfile(known_path, target)
        elif not target.is_file():
            url = (infos.get(name) or {}).get("url")
            if not url:
                continue
            for attempt in range(4):
                try:
                    response = SESSION.get(url, timeout=60)
                    response.raise_for_status()
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(response.content)
                    break
                except requests.RequestException:
                    if attempt == 3:
                        raise
                    time.sleep(attempt + 1)
        if target.is_file():
            relative = target.relative_to(ROOT / "public").as_posix()
            resolved[name] = relative
            manifest[name] = {"path": relative, "bytes": target.stat().st_size,
                              "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                              "sourceUrl": (infos.get(name) or {}).get("url")}
    write(SNAPSHOT / "asset-manifest.json", manifest)
    return resolved


def make_recipe(page, revision, index, fields):
    parts = ingredients(fields.get("ingredients"))
    if not parts:
        return None
    station_values = [fields.get(field) for field in ("crafter", "workshop", "workshop2")]
    stations = [plain_text(piece).strip() for value in station_values if value
                for piece in re.split(r"\s*,\s*|\s+or\s+", value)]
    output_name = plain_text(fields.get("crafteditem") or page, page)
    return {"id": f"{page}#{index}", "output": {"name": output_name, "quantity": quantity(fields.get("crafted quantity"))},
            "ingredients": parts, "stations": [name for name in stations if name],
            "craftTime": fields.get("crafting time") or None, "sourcePage": page,
            "sourceRevision": revision}


def main():
    cached = "--cached" in sys.argv
    previous_scope = read(SNAPSHOT / "scope.json", {}) if cached else {}
    materials = previous_scope.get("materials") if cached else category_pages("Crafting Materials")
    production = previous_scope.get("productionPlaces") if cached else category_pages("Production Places")
    if not materials or not production:
        raise RuntimeError("No category snapshot; run without --cached first")
    pages = read(SNAPSHOT / "pages.json") if cached else source_pages([*materials, *production, "Crafting", "Mortar"])
    cargo_rows = cargo_recipes(cached=cached)
    groups = station_groups(pages["Crafting"]["sourceWikitext"])
    stations = sorted(set(production) | (set(groups) - {"Manual Crafting"}))
    known_images = existing_images()
    next_pages = read(RESEARCH / "next-catalogs" / "item-pages.json", {})
    building = read(OUTPUT / "building-catalog.json", {})
    records = {}
    recipes = []
    images = set()

    def add_page(title, page):
        if page.get("missing"):
            return
        source = page["sourceWikitext"]
        parsed = templates(source)
        infobox = next((item["fields"] for item in parsed if item["name"] in ("item infobox", "armor infobox")), {})
        file = image_file(infobox, title)
        if file:
            images.add(file)
        records[title] = {"name": title, "page": title, "imageFile": file,
                          "description": plain_text(infobox.get("description", "")) or None,
                          "type": plain_text(infobox.get("type", "")) or None,
                          "rarity": infobox.get("rarity"), "stackSize": quantity(infobox.get("stack size"), None),
                          "level": quantity(infobox.get("level"), None), "biomes": infobox.get("biomes"),
                          "obtaining": obtaining(source, title), "sourceRevision": page.get("revision")}
        for index, item in enumerate(parsed):
            if item["name"] in ("crafting", "craftingrecipe"):
                recipe = make_recipe(title, page.get("revision"), index, item["fields"])
                if recipe:
                    recipes.append(recipe)

    # The research archive already includes many other craftable item pages.
    for title, page in next_pages.items():
        add_page(title, page)
    for title, page in pages.items():
        if title != "Crafting":
            add_page(title, page)
    for record in building.get("records", []):
        if record["name"] not in records:
            records[record["name"]] = {"name": record["name"], "page": record["sourcePage"],
                                       "imageFile": record.get("icon", {}).get("file") if record.get("icon") else None,
                                       "imagePath": record.get("icon", {}).get("path") if record.get("icon") else None,
                                       "description": record.get("description"), "type": record.get("type"),
                                       "rarity": record.get("rarity"), "stackSize": record.get("stackSize"),
                                       "level": record.get("level"), "biomes": record.get("biomes"),
                                       "obtaining": record.get("obtainingText") or (record.get("availability") or {}).get("text"),
                                       "sourceRevision": record.get("sourceRevision")}
        recipe = record.get("recipe") or {}
        if recipe.get("status") == "listed" and recipe.get("ingredients"):
            product = (recipe.get("products") or [{}])[0]
            recipes.append({"id": f"{record['sourcePage']}#building", "output": {
                "name": product.get("name") or record["name"], "quantity": product.get("quantity") or 1},
                "ingredients": [{"name": part["name"], "quantity": part.get("quantity") or 1}
                                for part in recipe["ingredients"]],
                "stations": recipe.get("workstations") or [], "craftTime": recipe.get("craftTime"),
                "sourcePage": record["sourcePage"], "sourceRevision": record.get("sourceRevision")})

    cargo_by_id = {}
    for row in cargo_rows:
        recipe_id = row.get("RecipeID")
        if recipe_id and row.get("CraftedItem"):
            cargo_by_id.setdefault(recipe_id, []).append(row)
    cargo_prepared = []
    for recipe_id, rows in cargo_by_id.items():
        first = rows[0]
        name = first["CraftedItem"].strip()
        parts = [{"name": row["SourceItem"].strip(), "quantity": quantity(row.get("SourceQuantity"))}
                 for row in rows if row.get("SourceItem", "").strip()]
        if not parts:
            continue
        recipe_stations = [first[field].strip() for field in ("Crafter", "Workshop", "Workshop2")
                           if first.get(field, "").strip()]
        cargo_prepared.append({"id": f"cargo:{recipe_id}",
            "output": {"name": name, "quantity": quantity(first.get("CraftedQuantity"))},
            "ingredients": parts, "stations": recipe_stations,
            "craftTime": first.get("CraftingTime", "").strip() or None,
            "sourcePage": name, "sourceRevision": records.get(name, {}).get("sourceRevision")})
    cargo_outputs = {recipe["output"]["name"].casefold() for recipe in cargo_prepared}
    recipes = cargo_prepared + [recipe for recipe in recipes
                                if recipe["output"]["name"].casefold() not in cargo_outputs]

    # Cargo includes outputs and ingredients beyond the browse catalogs.
    # Keep them navigable in the calculator and resolve their icons if present.
    recipe_names = {recipe["output"]["name"] for recipe in recipes}
    recipe_names.update(part["name"] for recipe in recipes for part in recipe["ingredients"])
    for name in sorted(recipe_names):
        if name not in records:
            file = None if name.startswith("Any ") else f"{name}.png"
            records[name] = {"name": name, "page": name, "imageFile": file,
                             "description": None, "type": None, "rarity": None,
                             "stackSize": None, "level": None, "biomes": None,
                             "obtaining": None, "sourceRevision": None}
            if file:
                images.add(file)

    # Resolve local assets first; only new wiki images need network requests.
    image_paths = copy_images(images, known_images)
    for record in records.values():
        if not record.get("imagePath") and record.get("imageFile"):
            record["imagePath"] = image_paths.get(record["imageFile"])
        record.pop("imageFile", None)
    seen = set()
    distinct = []
    for recipe in recipes:
        signature = (recipe["output"]["name"].casefold(), recipe["output"]["quantity"],
                     tuple(sorted((x["name"].casefold(), x["quantity"]) for x in recipe["ingredients"])),
                     tuple(sorted(x.casefold() for x in recipe["stations"])))
        if signature not in seen:
            seen.add(signature)
            distinct.append(recipe)
    catalog = {"schemaVersion": 1, "capturedAt": datetime.now(timezone.utc).isoformat(),
               "source": "Enshrouded Wiki item pages, crafting categories, and saved catalog snapshot",
               "materials": [records[name] for name in materials if name in records],
               "stations": [{**records[name], "group": groups.get(name, "Other")} for name in stations if name in records],
               "items": list(records.values()), "recipes": distinct}
    write(OUTPUT / "crafting-catalog.json", catalog)
    write(OUTPUT / "crafting-page-index.json", {
        "stations": [entry["name"] for entry in catalog["stations"]],
        "materials": [entry["name"] for entry in catalog["materials"]],
        "items": [entry["name"] for entry in catalog["items"]],
    })
    write(SNAPSHOT / "scope.json", {"materials": materials, "productionPlaces": production,
                                    "stations": stations, "stationGroups": groups,
                                    "capturedAt": catalog["capturedAt"]})
    print(f"Crafting: {len(catalog['materials'])} materials, {len(catalog['stations'])} stations, "
          f"{len(catalog['recipes'])} recipes, {len(image_paths)} resolved images")


if __name__ == "__main__":
    main()
