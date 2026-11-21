"""Snapshot the wiki's seedling and fishing tables for the Gameplay guide."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research" / "enshrouded-wiki" / "gameplay"
PUBLIC = ROOT / "public" / "data" / "enshrouded"
API = "https://enshrouded.wiki.gg/api.php"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "Mozilla/5.0 (compatible; EnshroudedMapResearch/1.0)"


def request(**params):
    for attempt in range(5):
        try:
            response = SESSION.get(API, params={"format": "json", "formatversion": 2, **params}, timeout=45)
            response.raise_for_status()
            result = response.json()
            if "error" in result:
                raise RuntimeError(result["error"])
            return result
        except (requests.RequestException, ValueError):
            if attempt == 4:
                raise
            time.sleep(attempt + 1)


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\ufffd", "—")).strip()


def text(node) -> str:
    return clean(node.get_text(" ", strip=True))


def top_tables(soup):
    return [table for table in soup.select("table.wikitable") if not table.find_parent("table")]


def direct_rows(table):
    body = table.find("tbody", recursive=False) or table
    return body.find_all("tr", recursive=False)


def cells(row):
    return row.find_all(["td", "th"], recursive=False)


def links(node):
    result = []
    for anchor in node.find_all("a", href=True):
        path = urlparse(anchor["href"]).path
        if path.startswith("/wiki/") and not path.startswith("/wiki/File:"):
            page = unquote(path.removeprefix("/wiki/")).replace("_", " ")
            if page not in result:
                result.append(page)
    return result


def image_file(node):
    image = node if node.name == "img" else node.find("img")
    if not image:
        return None
    path = urlparse(image.get("src", "")).path
    match = re.search(r"/images/(?:thumb/)?([^/]+)", path)
    return unquote(match.group(1)).replace("_", " ") if match else None


def quantities(value: str):
    return [{"name": clean(name), "quantity": int(count.replace(",", ""))}
            for name, count in re.findall(r"([^,]+?)\s+x\s*([\d,]+)", value)]


def recipe(node):
    table = node.find("table")
    if not table:
        return None
    values = {}
    for row in direct_rows(table):
        parts = cells(row)
        if len(parts) == 2:
            values[text(parts[0]).rstrip(":").strip().lower()] = text(parts[1])
    if not values:
        return None
    return {"ingredients": quantities(values.get("ingredients", "")),
            "workstations": [part.strip() for part in values.get("workstation", "").split("+") if part.strip()],
            "craftTime": values.get("craft time") or None,
            "products": quantities(values.get("product", ""))}


def page(title):
    parsed = request(action="parse", page=title, prop="text|revid")["parse"]
    return parsed, BeautifulSoup(parsed["text"], "html.parser")


def seedlings(parsed, soup):
    # The source uses nine tabber tables, in this order; no HTML headings are emitted.
    groups = re.findall(r"<big>([^<]+)=</big>", request(action="query", prop="revisions",
        rvslots="main", rvprop="content", titles="Seedlings")["query"]["pages"][0]["revisions"][0]
        ["slots"]["main"]["content"])
    tables = top_tables(soup)
    if len(groups) != len(tables):
        raise RuntimeError(f"Seedlings groups/tables differ: {len(groups)} vs {len(tables)}")
    result = []
    for group, table in zip(groups, tables):
        for row in direct_rows(table)[1:]:
            parts = cells(row)
            if len(parts) != 6:
                continue
            name = text(parts[0])
            result.append({"name": name, "group": group, "imageFile": image_file(parts[0]),
                           "obtainedBy": text(parts[1]), "obtainedLinks": links(parts[1]),
                           "recipe": recipe(parts[2]), "waterRequirement": text(parts[3]),
                           "growthTime": re.sub(r"\s*\[.*", "", text(parts[4])).strip(),
                           "yields": text(parts[5]), "yieldLinks": links(parts[5])})
    return result


def fishing(soup):
    tables = top_tables(soup)
    if len(tables) != 3:
        raise RuntimeError(f"Expected three Fishing tables, got {len(tables)}")
    rods = []
    for row in direct_rows(tables[0])[1:]:
        parts = cells(row)
        if len(parts) == 7:
            rods.append({"name": text(parts[0]), "imageFile": image_file(parts[0]),
                         "strength": text(parts[1]), "actualStrength": text(parts[2]),
                         "endurance": text(parts[3]), "bootWeight": text(parts[4]),
                         "otherWeight": text(parts[5]), "obtainedBy": text(parts[6]),
                         "obtainedLinks": links(parts[6])})
    spot_rows = direct_rows(tables[1])
    rate_names = [text(part) for part in cells(spot_rows[0])[2:]]
    spots = []
    for row in spot_rows[1:]:
        parts = cells(row)
        if len(parts) == len(rate_names) + 2:
            spots.append({"biome": text(parts[0]), "description": text(parts[1]),
                          "rates": [{"name": name, "rate": text(part)}
                                    for name, part in zip(rate_names, parts[2:])]})
    loot_rows = direct_rows(tables[2])
    bait_groups = [text(part) for part in cells(loot_rows[0])[1:]]
    loot = []
    for row in loot_rows[1:]:
        parts = cells(row)
        if len(parts) == len(bait_groups) + 1:
            loot.append({"name": text(parts[0]), "imageFile": image_file(parts[0]),
                         "rates": [text(part) if "%" in text(part) else None for part in parts[1:]]})
    return {"rods": rods, "spots": spots, "fish": rate_names[:-2],
            "baitGroups": bait_groups, "loot": loot}


def animal_husbandry(soup, known_regions):
    tables = top_tables(soup)
    if len(tables) != 2:
        raise RuntimeError(f"Expected two Animal Husbandry tables, got {len(tables)}")
    animals = []
    for row in direct_rows(tables[0])[1:]:
        parts = cells(row)
        if len(parts) != 6:
            continue
        name = text(parts[0])
        animals.append({"name": name, "kind": "wildlife", "regions": known_regions.get(name),
                        "bait": text(parts[1]), "bed": text(parts[2]),
                        "feeder": text(parts[3]), "food": text(parts[4]),
                        "resource": text(parts[5]) if text(parts[5]) != "-" else None,
                        "imageFile": image_file(parts[0])})
    for kind, row in zip(("cat", "dog"), direct_rows(tables[1])[1:]):
        parts = cells(row)
        if len(parts) != 5:
            continue
        names = links(parts[0])
        images = [image_file(img) for img in parts[0].find_all("img")]
        for name, image in zip(names, images):
            animals.append({"name": name, "kind": kind, "regions": known_regions.get(name),
                            "bait": text(parts[1]), "bed": text(parts[2]),
                            "feeder": text(parts[3]), "food": text(parts[4]),
                            "resource": None, "imageFile": image})
    if len(animals) != 15:
        raise RuntimeError(f"Expected 15 tameable animals, got {len(animals)}")
    return animals


def existing_images():
    result = {}
    catalog = PUBLIC / "wiki-catalog.json"
    if catalog.is_file():
        # The saved asset manifest gives the original file name for each image.
        manifest = ROOT / "research" / "enshrouded-wiki" / "next-catalogs" / "asset-manifest.json"
        for name, info in json.loads(manifest.read_text(encoding="utf-8")).items():
            path = PUBLIC / "images" / Path(info["path"]).name
            if path.is_file():
                result[name.casefold()] = f"data/enshrouded/images/{path.name}"
    building = PUBLIC / "building-catalog.json"
    if building.is_file():
        data = json.loads(building.read_text(encoding="utf-8"))
        for record in data["records"]:
            for key in ("icon", "appearance"):
                image = record.get(key)
                if image and image.get("file") and image.get("path"):
                    result[image["file"].casefold()] = image["path"]
    return result


def resolve_images(records):
    known = existing_images()
    names = sorted({record["imageFile"] for record in records if record.get("imageFile")})
    missing = [name for name in names if name.casefold() not in known]
    saved = {}
    for start in range(0, len(missing), 25):
        batch = missing[start:start + 25]
        response = request(action="query", prop="imageinfo", iiprop="url|size|mime",
                           titles="|".join("File:" + name for name in batch))
        for image in response["query"]["pages"]:
            info = (image.get("imageinfo") or [{}])[0]
            if not info.get("url") or not info.get("mime", "").startswith("image/"):
                continue
            name = image["title"].removeprefix("File:")
            url = info["url"]
            digest = hashlib.sha256(name.encode("utf-8")).hexdigest()[:20]
            filename = digest + Path(name).suffix.lower()
            output = PUBLIC / "gameplay-images" / filename
            archive = RESEARCH / "assets" / filename
            if not output.is_file():
                archive.parent.mkdir(parents=True, exist_ok=True)
                for attempt in range(5):
                    try:
                        downloaded = SESSION.get(url, timeout=45)
                        downloaded.raise_for_status()
                        archive.write_bytes(downloaded.content)
                        break
                    except requests.RequestException:
                        if attempt == 4:
                            raise
                        time.sleep(attempt + 1)
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(archive, output)
            known[name.casefold()] = f"data/enshrouded/gameplay-images/{filename}"
            saved[name] = {"url": url, "path": str(archive.relative_to(RESEARCH)).replace("\\", "/"),
                           "bytes": output.stat().st_size,
                           "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}
    for record in records:
        record["icon"] = known.get((record.pop("imageFile") or "").casefold())
    write(RESEARCH / "asset-manifest.json", saved)
    return len(names), len(missing), len(saved)


def main():
    animal_snapshot = json.loads((RESEARCH / "animal-husbandry.json").read_text(encoding="utf-8"))
    if "--offline" in sys.argv:
        saved = json.loads((RESEARCH / "snapshot.json").read_text(encoding="utf-8"))
        crop_records, fish_records, source = saved["seedlings"], saved["fishing"], saved["sourceRevisions"]
        image_stats = saved["imageStats"]
        animal_data = animal_snapshot
    else:
        seed_page, seed_html = page("Seedlings")
        fish_page, fish_html = page("Fishing")
        animal_page, animal_html = page("Animal Husbandry")
        crop_records = seedlings(seed_page, seed_html)
        fish_records = fishing(fish_html)
        regions = {animal["name"]: animal["regions"] for animal in animal_snapshot["animals"]}
        animal_records = animal_husbandry(animal_html, regions)
        image_records = [*crop_records, *animal_records, *fish_records["rods"], *fish_records["loot"]]
        image_stats = resolve_images(image_records)
        source = {"Seedlings": seed_page["revid"], "Fishing": fish_page["revid"],
                  "Animal Husbandry": animal_page["revid"]}
        animal_data = {"source": "https://enshrouded.wiki.gg/wiki/Animal_Husbandry",
                       "revision": animal_page["revid"], "animals": animal_records}
        write(RESEARCH / "animal-husbandry.json", animal_data)
    write(RESEARCH / "snapshot.json", {"sourceRevisions": source, "seedlings": crop_records,
                                        "animalHusbandry": animal_data, "fishing": fish_records,
                                        "imageStats": image_stats})
    write(PUBLIC / "gameplay-catalog.json", {"schemaVersion": 1, "sourceRevisions": source,
                                              "seedlings": crop_records, "animals": animal_data["animals"],
                                              "fishing": fish_records})
    print(f"Gameplay: {len(crop_records)} seedlings, {len(animal_data['animals'])} animals, {len(fish_records['rods'])} rods, "
          f"{len(fish_records['spots'])} fishing spots, {len(fish_records['loot'])} loot rows; "
          f"images {image_stats}")


if __name__ == "__main__":
    main()
