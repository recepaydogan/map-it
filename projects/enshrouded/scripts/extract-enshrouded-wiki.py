"""Snapshot the Enshrouded wiki's building catalogs and map configuration.

This produces research data only. It does not connect the data to the app.
Run with: python scripts/extract-enshrouded-wiki.py
Requires: requests and beautifulsoup4.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "research" / "enshrouded-wiki"
BASE = "https://enshrouded.wiki.gg"
API = f"{BASE}/api.php"
CATALOGS = {
    "Building_Materials": ["stone-blocks", "wood-blocks", "luminescent-blocks", "other-blocks"],
    "Terrain_Materials": ["road-blocks", "terrain-materials", "rubble", "soil-and-dirt", "other-blocks"],
    "Overgrowth_Materials": ["overgrowth-materials"],
    "Roof_Materials": ["roof-materials"],
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)"})


def api(**params: str) -> dict:
    response = SESSION.get(API, params={"format": "json", "formatversion": 2, **params}, timeout=45)
    response.raise_for_status()
    result = response.json()
    if "error" in result:
        raise RuntimeError(result["error"])
    return result


def page_link(href: str | None) -> dict | None:
    if not href:
        return None
    url = urljoin(BASE, href)
    path = urlparse(url).path
    if not path.startswith("/wiki/"):
        return None
    result = {"page": unquote(path.removeprefix("/wiki/")).replace("_", " ")}
    marker = parse_qs(urlparse(url).query).get("marker", [])
    if marker:
        result["markerId"] = marker[0]
    return result


def links(element) -> list[dict]:
    found: list[dict] = []
    for anchor in element.find_all("a"):
        label = anchor.get_text(" ", strip=True)
        reference = page_link(anchor.get("href"))
        if label and reference and {**reference, "label": label} not in found:
            found.append({**reference, "label": label})
    return found


def direct_rows(table) -> list:
    body = table.find("tbody", recursive=False)
    return body.find_all("tr", recursive=False) if body else []


def quantities(value: str, references: list[dict]) -> list[dict]:
    result: list[dict] = []
    for part in value.split(","):
        match = re.fullmatch(r"\s*(.*?)\s+x\s*([\d,]+)\s*", part)
        if not match:
            if part.strip():
                result.append({"raw": part.strip()})
            continue
        name, count = match.group(1).strip(), int(match.group(2).replace(",", ""))
        record = {"name": name, "quantity": count}
        reference = next((link for link in references if link["label"] == name), None)
        if reference:
            record["page"] = reference["page"]
        result.append(record)
    return result


def recipe_from_cell(cell) -> dict:
    table = cell.find("table")
    if not table:
        text = cell.get_text(" ", strip=True)
        return {"status": "not-craftable" if "Not Craftable" in text else "unavailable", "raw": text}
    values = {}
    for row in direct_rows(table):
        cells = row.find_all("td", recursive=False)
        if len(cells) != 2:
            continue
        label = cells[0].get_text(" ", strip=True).rstrip(":").strip().lower()
        values[label] = (cells[1].get_text(" ", strip=True), links(cells[1]))
    ingredients = values.get("ingredients", ("", []))
    product = values.get("product", ("", []))
    workstation = values.get("workstation", ("", []))
    return {
        "status": "listed",
        "ingredients": quantities(*ingredients),
        "workstations": [link["page"] for link in workstation[1]] or ([workstation[0]] if workstation[0] else []),
        "craftTime": values.get("craft time", ("", []))[0] or None,
        "products": quantities(*product),
    }


def catalog(page: str, groups: list[str]) -> tuple[dict, list[dict]]:
    result = api(action="parse", page=page, prop="text|revid")
    parsed = result["parse"]
    soup = BeautifulSoup(parsed["text"], "html.parser")
    tables = soup.select("table.wikitable")
    if len(tables) != len(groups):
        raise RuntimeError(f"{page}: expected {len(groups)} tables, got {len(tables)}")
    records: list[dict] = []
    for table, group in zip(tables, groups):
        for row in direct_rows(table)[1:]:
            cells = row.find_all("td", recursive=False)
            if len(cells) not in (3, 4):
                raise RuntimeError(f"{page}/{group}: unexpected cell count {len(cells)}")
            names = links(cells[0])
            if not names:
                raise RuntimeError(f"{page}/{group}: row has no linked item")
            name = names[-1]["label"]
            reference = names[-1]["page"]
            image = cells[0].find("img")
            detail = cells[-2]
            record = {
                "name": name,
                "page": reference,
                "sourceCatalog": page.replace("_", " "),
                "group": group,
                "imageFile": image.get("alt").replace("_", " ") if image and image.get("alt") else None,
                "set": cells[1].get_text(" ", strip=True) if len(cells) == 4 else None,
                "availability": {
                    "text": detail.get_text(" ", strip=True),
                    "links": links(detail),
                },
                "recipe": recipe_from_cell(cells[-1]),
            }
            records.append(record)
    return {"page": page.replace("_", " "), "revision": parsed["revid"], "recordCount": len(records)}, records


def batched(values: list[str], size: int = 40):
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def wiki_template(source: str, title: str) -> str | None:
    start = re.search(r"\{\{\s*" + re.escape(title) + r"\s*(?=\||\})", source, flags=re.I)
    if not start:
        return None
    depth = 0
    position = start.start()
    while position < len(source) - 1:
        pair = source[position : position + 2]
        if pair == "{{":
            depth += 1
            position += 2
        elif pair == "}}":
            depth -= 1
            position += 2
            if depth == 0:
                return source[start.end() : position - 2]
        else:
            position += 1
    return None


def template_fields(body: str | None) -> dict[str, str]:
    if body is None:
        return {}
    result = {}
    for line in body.splitlines():
        match = re.match(r"\s*\|\s*([^=]+?)\s*=\s*(.*)", line)
        if match:
            result[match.group(1).strip().lower()] = match.group(2).strip()
    return result


def plain_wikitext(value: str) -> str:
    text = re.sub(r"\[\[(?:[^]|]*\|)?([^]|]+)\]\]", r"\1", value)
    text = re.sub(r"'{2,}", "", text)
    return re.sub(r"\s+", " ", text).strip()


def detail_pages(titles: list[str]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for batch in batched(titles):
        response = api(
            action="query", prop="revisions", rvslots="main", rvprop="content|ids|timestamp",
            redirects="1", titles="|".join(batch),
        )
        for page in response["query"]["pages"]:
            if "missing" in page or not page.get("revisions"):
                continue
            revision = page["revisions"][0]
            source = revision["slots"]["main"]["content"]
            info = template_fields(wiki_template(source, "Item Infobox"))
            crafting = template_fields(wiki_template(source, "Crafting"))
            appearance = re.search(r"==\s*Building Appearance\s*==.*?\[\[File:([^]|]+)", source, flags=re.I | re.S)
            obtain = re.search(r"==\s*Obtaining\s*==\s*(.*?)(?=\n==|\n\[\[Category:|\Z)", source, flags=re.I | re.S)
            recipe = None
            if crafting:
                ingredient_text = crafting.get("ingredients", "")
                recipe = {
                    "status": "listed",
                    "ingredients": [
                        {"name": name.strip(), "quantity": int(count)}
                        for name, count in re.findall(r"([^,:]+):\s*(\d+)", ingredient_text)
                    ],
                    "workstations": [crafting[key] for key in ("workshop", "crafter") if crafting.get(key)],
                    "craftTime": crafting.get("crafting time"),
                    "products": [{"name": page["title"], "quantity": int(crafting["crafted quantity"])}]
                    if crafting.get("crafted quantity", "").isdigit() else [],
                }
            image_file = info.get("images")
            if image_file:
                image_file = image_file.replace("{{PAGENAME}}", page["title"]).replace("_", " ")
            quantity_text = crafting.get("crafted quantity") or crafting.get("quantity") or ""
            if recipe is not None and quantity_text.isdigit():
                recipe["products"] = [{"name": page["title"], "quantity": int(quantity_text)}]
            result[page["title"]] = {
                "pageId": page["pageid"], "revision": revision["revid"],
                "updatedAt": revision["timestamp"],
                "type": info.get("type"), "rarity": info.get("rarity"),
                "stackSize": int(info["stack size"]) if info.get("stack size", "").isdigit() else None,
                "level": int(info["level"]) if info.get("level", "").isdigit() else None,
                "biomes": plain_wikitext(info["biomes"]) if info.get("biomes") else None,
                "description": plain_wikitext(info["description"]) if info.get("description") else None,
                "imageFile": image_file,
                "appearanceImageFile": appearance.group(1).strip().replace("_", " ") if appearance else None,
                "obtainingText": plain_wikitext(obtain.group(1)) if obtain else None,
                "recipe": recipe,
                "sourceWikitext": source,
            }
    return result


def recipe_signature(recipe: dict | None) -> tuple | None:
    if not recipe or recipe["status"] != "listed":
        return None
    return (
        tuple(sorted((item.get("name", ""), item.get("quantity")) for item in recipe["ingredients"])),
        tuple(sorted(recipe["workstations"])),
        recipe["craftTime"],
        tuple(sorted((item.get("name", ""), item.get("quantity")) for item in recipe["products"])),
    )


def image_files(names: list[str]) -> dict[str, dict]:
    result = {}
    for batch in batched(names):
        response = api(action="query", prop="imageinfo", iiprop="url|size|mime", titles="|".join(
            f"File:{name}" for name in batch))
        for page in response["query"]["pages"]:
            name = page["title"].removeprefix("File:")
            info = page.get("imageinfo", [{}])[0]
            result[name] = {"url": info.get("url"), "width": info.get("width"),
                "height": info.get("height"), "bytes": info.get("size"), "mime": info.get("mime")}
    return result


def related_pages(records: list[dict]) -> dict:
    catalog_pages = {record["page"] for record in records}
    related = set()
    for record in records:
        related.update(link["page"] for link in record["availability"]["links"] if link["page"] != "Map")
        for recipe in (record["recipe"], (record["detail"] or {}).get("recipe")):
            if not recipe or recipe["status"] != "listed":
                continue
            related.update(item.get("page", item.get("name")) for item in recipe["ingredients"])
            related.update(recipe["workstations"])
    titles = sorted(related - catalog_pages)
    pages = {}
    for batch in batched(titles):
        response = api(action="query", prop="revisions", rvslots="main", rvprop="content|ids|timestamp",
            redirects="1", titles="|".join(batch))
        for page in response["query"]["pages"]:
            if "missing" in page or not page.get("revisions"):
                pages[page["title"]] = {"missing": True}
                continue
            revision = page["revisions"][0]
            source = revision["slots"]["main"]["content"]
            info = template_fields(wiki_template(source, "Item Infobox"))
            image = info.get("images")
            if image:
                image = image.replace("{{PAGENAME}}", page["title"]).replace("_", " ")
            pages[page["title"]] = {"pageId": page["pageid"], "revision": revision["revid"],
                "updatedAt": revision["timestamp"], "type": info.get("type"),
                "description": plain_wikitext(info["description"]) if info.get("description") else None,
                "imageFile": image, "sourceWikitext": source}
    return {"requestedCount": len(titles), "pages": pages}


def map_config() -> dict:
    parsed = api(action="parse", page="Map", prop="text|revid")["parse"]
    soup = BeautifulSoup(parsed["text"], "html.parser")
    maps = []
    for container, script in zip(soup.select("[data-mw-datamaps='map']"),
        soup.select("script[type='application/datamap+json'][data-purpose='config']")):
        configuration = json.loads(script.string)
        maps.append({"id": container.get("data-datamap-id"), "config": configuration})
    return {"pageRevision": parsed["revid"], "maps": maps}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    metadata = []
    all_records = []
    for page, groups in CATALOGS.items():
        source, records = catalog(page, groups)
        metadata.append(source)
        all_records.extend(records)
        print(f"{page}: {len(records)} records (revision {source['revision']})")
    if len(all_records) != 123:
        raise RuntimeError(f"Expected 123 building records, got {len(all_records)}")
    names = [record["page"] for record in all_records]
    if len(names) != len(set(names)):
        raise RuntimeError("Building catalog contains duplicate pages")
    details = detail_pages(names)
    conflicts = []
    for record in all_records:
        record["detail"] = details.get(record["page"])
        if not record["detail"]:
            conflicts.append({"page": record["page"], "field": "detail", "reason": "missing page"})
            continue
        listed, detail = recipe_signature(record["recipe"]), recipe_signature(record["detail"]["recipe"])
        if listed and detail and listed != detail:
            conflicts.append({"page": record["page"], "field": "recipe", "listed": record["recipe"],
                "detail": record["detail"]["recipe"]})
        elif listed != detail:
            conflicts.append({"page": record["page"], "field": "recipe-availability",
                "listed": record["recipe"], "detail": record["detail"]["recipe"]})
        if record["imageFile"] and record["detail"]["imageFile"] and record["imageFile"] != record["detail"]["imageFile"]:
            conflicts.append({"page": record["page"], "field": "image", "listed": record["imageFile"],
                "detail": record["detail"]["imageFile"]})
    files = sorted({name for record in all_records for name in (
        record["imageFile"], (record["detail"] or {}).get("imageFile"),
        (record["detail"] or {}).get("appearanceImageFile")) if name})
    images = image_files(files)
    missing_images = [name for name in files if not images.get(name, {}).get("url")]
    snapshot = {"schemaVersion": 1, "capturedAt": datetime.now(timezone.utc).isoformat(),
        "source": BASE, "catalogs": metadata, "records": all_records}
    (OUTPUT / "building-materials.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "building-images.json").write_text(json.dumps(images, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "building-conflicts.json").write_text(json.dumps(conflicts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    related = related_pages(all_records)
    (OUTPUT / "related-pages.json").write_text(json.dumps(related, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "map-config.json").write_text(json.dumps(map_config(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Details: {len(details)}/{len(all_records)}; images: {len(images)} ({len(missing_images)} missing); conflicts: {len(conflicts)}")
    print(f"Related pages: {len(related['pages'])}/{related['requestedCount']}")
    if missing_images:
        print("Missing images:", ", ".join(missing_images))


if __name__ == "__main__":
    main()
