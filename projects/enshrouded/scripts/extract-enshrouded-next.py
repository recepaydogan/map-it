"""Research-only snapshot of collectibles, comfort, decorations and equipment."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "research" / "enshrouded-wiki" / "next-catalogs"
BASE = "https://enshrouded.wiki.gg"
API = f"{BASE}/api.php"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)"})
ROOT_PAGES = ("Collectibles", "Comfort", "Decorations", "Equipment")
COMFORT_PAGES = ("Beds", "Tables", "Benches", "Chairs", "Carpets", "Bathroom",
                 "Fireplaces", "Illumination", "Wall Decorations")


def api(**params):
    for attempt in range(4):
        response = SESSION.get(API, params={"format": "json", "formatversion": 2, **params}, timeout=60)
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        response.raise_for_status()
        result = response.json()
        if "error" in result:
            raise RuntimeError(result["error"])
        return result
    raise RuntimeError(f"Wiki API unavailable for {params}")


def write(name: str, data):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read(name: str, default):
    path = OUTPUT / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def title_from_href(href: str | None) -> str | None:
    if not href:
        return None
    path = urlparse(urljoin(BASE, href)).path
    if not path.startswith("/wiki/"):
        return None
    title = unquote(path.removeprefix("/wiki/")).replace("_", " ")
    return title if not title.startswith(("File:", "Category:", "Special:", "Template:")) else None


def links(element):
    result = []
    for anchor in element.find_all("a", href=True):
        title = title_from_href(anchor["href"])
        if title and title not in result:
            result.append(title)
    return result


def parse_page(title: str):
    result = api(action="parse", page=title, prop="text|revid")
    parsed = result["parse"]
    return parsed, BeautifulSoup(parsed["text"], "html.parser")


def inventory():
    for title in ROOT_PAGES:
        parsed, soup = parse_page(title)
        print(f"\n{title} revision={parsed['revid']} tables={len(soup.select('table.wikitable'))}")
        print("headings:", [x.get_text(" ", strip=True) for x in soup.select("h2,h3")][:35])
        print("links:", links(soup.select_one(".mw-parser-output") or soup)[:60])
    for title in ("Arrows", "Weapons", "Tools", "Armor", "Armor/Melee", "Wall Decorations", "Beds", "Decorations/Collections"):
        try:
            parsed, soup = parse_page(title)
            print(f"\n{title} revision={parsed['revid']} tables={len(soup.select('table.wikitable'))}")
            print("links:", links(soup.select_one(".mw-parser-output") or soup)[:45])
            for table in soup.select("table.wikitable")[:5]:
                first = table.find("tr")
                print("table:", first.get_text(" | ", strip=True)[:200] if first else "empty",
                      "rows", len(table.select("tr")))
        except Exception as exc:
            print(title, "ERROR", exc)


def catalog_pages():
    roots = {}
    for title in ROOT_PAGES:
        parsed, soup = parse_page(title)
        roots[title] = {"revision": parsed["revid"], "links": links(soup.select_one(".mw-parser-output") or soup)}
    decoration_links = [x for x in roots["Decorations"]["links"] if x.startswith("Decorations/")]
    equipment_links = []
    for name in roots["Equipment"]["links"]:
        if name not in ROOT_PAGES and name not in equipment_links:
            equipment_links.append(name)
    pages = {"collectibles": ["Collectibles"],
             "comfort": ["Comfort", *COMFORT_PAGES],
             "decorations": ["Decorations", *decoration_links],
             "equipment": ["Equipment", *equipment_links]}
    # The wiki also has aggregate equipment pages omitted from the landing grid.
    for name in ("Weapons", "Armor", "Armor/Cosmetic", "Food"):
        if name not in pages["equipment"]:
            pages["equipment"].append(name)
    for key in pages:
        pages[key] = list(dict.fromkeys(pages[key]))
    return roots, pages


def table_heading(table) -> str:
    previous = table.find_previous(["h2", "h3", "h4"])
    return previous.get_text(" ", strip=True).removesuffix("[ edit ]") if previous else "Overview"


def armor_item_rows(table, catalog: str, source_page: str, header: list[str]):
    """Expand set/location rowspans and emit armor pieces, not set labels."""
    result = []
    spanning = {}
    for index, row in enumerate(table.find_all("tr")[1:], start=1):
        if row.find_parent("table") is not table:
            continue
        logical = {column: cell for column, (_, cell) in spanning.items()}
        next_spanning = {column: (remaining - 1, cell)
                         for column, (remaining, cell) in spanning.items() if remaining > 1}
        column = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while column in logical:
                column += 1
            width = int(cell.get("colspan", 1))
            height = int(cell.get("rowspan", 1))
            for offset in range(width):
                logical[column + offset] = cell
                if height > 1:
                    next_spanning[column + offset] = (height - 1, cell)
            column += width
        spanning = next_spanning
        name_cell = logical.get(1)
        if not name_cell:
            continue
        name = name_cell.get_text(" ", strip=True)
        item_links = links(name_cell)
        if not name or not item_links:
            continue
        image = name_cell.find("img")
        image_file = None
        if image:
            image_path = urlparse(urljoin(BASE, image.get("src", ""))).path
            image_match = re.search(r"/images/(?:thumb/)?([^/]+)", image_path)
            image_file = unquote(image_match.group(1)).replace("_", " ") if image_match else image.get("alt")
        result.append({"catalog": catalog, "sourcePage": source_page,
                       "section": table_heading(table), "row": index,
                       "headers": header[1:], "name": name, "page": item_links[-1],
                       "imageFile": image_file,
                       "cells": [{"text": logical.get(i).get_text(" ", strip=True) if logical.get(i) else "",
                                  "links": links(logical[i]) if i in logical else []}
                                 for i in range(1, len(header))]})
    return result


def table_rows(table, catalog: str, source_page: str):
    rows = [row for row in table.find_all("tr") if row.find_parent("table") is table]
    if not rows:
        return []
    header = [cell.get_text(" ", strip=True) for cell in rows[0].find_all(["th", "td"], recursive=False)]
    if catalog == "equipment" and source_page.startswith("Armor/") and header[:2] == ["Set", "Name"]:
        return armor_item_rows(table, catalog, source_page, header)
    result = []
    for index, row in enumerate(rows[1:], start=1):
        cells = row.find_all(["td", "th"], recursive=False)
        if len(cells) < 2:
            continue
        first_links = links(cells[0])
        name = cells[0].get_text(" ", strip=True)
        if not name:
            continue
        image = cells[0].find("img")
        image_file = None
        if image:
            image_path = urlparse(urljoin(BASE, image.get("src", ""))).path
            image_match = re.search(r"/images/(?:thumb/)?([^/]+)", image_path)
            image_file = (unquote(image_match.group(1)).replace("_", " ")
                          if image_match else image.get("alt"))
        values = []
        for cell in cells:
            values.append({"text": cell.get_text(" ", strip=True), "links": links(cell)})
        result.append({"catalog": catalog, "sourcePage": source_page,
                       "section": table_heading(table), "row": index,
                       "headers": header, "name": name,
                       "page": first_links[-1] if first_links else None,
                       "imageFile": image_file, "cells": values})
    return result


def refresh_equipment():
    """Refresh armor pieces and food without refetching every wiki catalog."""
    titles = ("Armor/Melee", "Armor/Magic", "Armor/Ranged", "Armor/Cosmetic", "Food")
    saved_rows = read("catalog-rows.json", [])
    captured = read("catalog-pages.json", {})
    replacements = {}
    for title in titles:
        parsed, soup = parse_page(title)
        tables = [table for table in soup.select("table.wikitable") if not table.find_parent("table")]
        replacements[title] = [record for table in tables for record in table_rows(table, "equipment", title)]
        captured[title] = {"catalog": "equipment", "revision": parsed["revid"],
                           "tableCount": len(tables), "rowCount": len(replacements[title]),
                           "headings": [x.get_text(" ", strip=True) for x in soup.select("h2,h3,h4")],
                           "links": links(soup.select_one(".mw-parser-output") or soup)}
        print(f"{title}: {len(replacements[title])} item rows")
    refreshed = []
    emitted = set()
    for row in saved_rows:
        title = row["sourcePage"]
        if title in replacements:
            if title not in emitted:
                refreshed.extend(replacements[title])
                emitted.add(title)
        else:
            refreshed.append(row)
    for title in titles:
        if title not in emitted:
            refreshed.extend(replacements[title])
    write("catalog-rows.json", refreshed)
    write("catalog-pages.json", captured)
    scope = read("scope.json", {})
    equipment_pages = scope.get("pages", {}).get("equipment", [])
    if "Food" not in equipment_pages:
        equipment_pages.append("Food")
        write("scope.json", scope)
    details = read("item-pages.json", {})
    needed = sorted({row["page"] for title in titles for row in replacements[title]
                     if row["page"] and row["page"] not in details})
    for batch in batches(needed):
        response = api(action="query", prop="revisions", rvslots="main", rvprop="content|ids|timestamp",
                       redirects="1", titles="|".join(batch))
        for page in response["query"]["pages"]:
            if "missing" in page or not page.get("revisions"):
                details[page["title"]] = {"missing": True}
                continue
            revision = page["revisions"][0]
            source = revision["slots"]["main"]["content"]
            details[page["title"]] = {"pageId": page["pageid"], "revision": revision["revid"],
                                      "updatedAt": revision["timestamp"],
                                      "fields": infobox_fields(source), "sourceWikitext": source}
    write("item-pages.json", details)
    names = {resolved_image_name(details[title]["fields"]["images"], title)
             for title in needed if title in details and not details[title].get("missing")
             and details[title]["fields"].get("images")}
    runtime_catalog = ROOT / "public" / "data" / "enshrouded" / "wiki-catalog.json"
    if runtime_catalog.exists():
        runtime_records = json.loads(runtime_catalog.read_text(encoding="utf-8"))["records"]
        names.update(f"{record['id']}.png" for record in runtime_records
                     if record["catalog"] == "equipment" and not record.get("icon"))
    images = image_info(names)
    existing_assets = read("asset-manifest.json", {})
    missing_images = {name: info for name, info in images.items()
                      if name in names and name not in existing_assets and info.get("url")}
    if missing_images:
        download_images(missing_images)
    print(f"Refreshed {len(refreshed)} catalog rows; {len(needed)} new detail pages; {len(missing_images)} new images")


def snapshot_catalogs():
    roots, pages = catalog_pages()
    write("scope.json", {"roots": roots, "pages": pages,
                         "capturedAt": datetime.now(timezone.utc).isoformat()})
    captured = {}
    records = []
    failures = {}
    for catalog, titles in pages.items():
        for title in titles:
            try:
                parsed, soup = parse_page(title)
                tables = [table for table in soup.select("table.wikitable") if not table.find_parent("table")]
                rows = [record for table in tables
                        for record in table_rows(table, catalog, title)]
                if title in ("Weapons", "Armor"):
                    all_links = links(soup.select_one(".mw-parser-output") or soup)
                    start_after = "Weapons" if title == "Weapons" else "Armor/Cosmetic"
                    start = all_links.index(start_after) + 1 if start_after in all_links else 0
                    for index, name in enumerate(all_links[start:], 1):
                        if name in ("Embervale", "Enshrouded", "Bestiary", "Weapons", "Armor"):
                            continue
                        rows.append({"catalog": catalog, "sourcePage": title,
                                     "section": "Index", "row": index,
                                     "headers": [], "name": name, "page": name,
                                     "imageFile": None, "cells": []})
                captured[title] = {"catalog": catalog, "revision": parsed["revid"],
                                   "tableCount": len(tables),
                                   "rowCount": len(rows),
                                   "headings": [x.get_text(" ", strip=True) for x in soup.select("h2,h3,h4")],
                                   "links": links(soup.select_one(".mw-parser-output") or soup)}
                records.extend(rows)
                print(f"{catalog:12} {title:34} {len(rows):4} rows")
            except Exception as exc:
                failures[title] = str(exc)
                print(f"FAILED {title}: {exc}")
        write("catalog-pages.json", captured)
        write("catalog-rows.json", records)
    write("failures.json", failures)
    return records


def batches(values, size=40):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def infobox_fields(source: str) -> dict:
    match = re.search(r"\{\{\s*(?:Item|Armor)[ _]Infobox\s*(.*?)\n\}\}", source,
                      flags=re.I | re.S)
    if not match:
        return {}
    fields = {}
    for line in match.group(1).splitlines():
        field = re.match(r"\s*\|\s*([^=]+?)\s*=\s*(.*)", line)
        if field:
            fields[field.group(1).strip().lower()] = field.group(2).strip()
    return fields


def resolved_image_name(value: str, title: str) -> str:
    return " ".join(value.replace("{{PAGENAME}}", title)
                    .replace("{{SUBPAGENAME}}", title.rsplit("/", 1)[-1])
                    .replace("_", " ").split())


def detail_pages(records):
    titles = sorted({record["page"] for record in records if record["page"]})
    result = {}
    for batch in batches(titles):
        response = api(action="query", prop="revisions", rvslots="main", rvprop="content|ids|timestamp",
                       redirects="1", titles="|".join(batch))
        for page in response["query"]["pages"]:
            if "missing" in page or not page.get("revisions"):
                result[page["title"]] = {"missing": True}
                continue
            revision = page["revisions"][0]
            source = revision["slots"]["main"]["content"]
            result[page["title"]] = {"pageId": page["pageid"], "revision": revision["revid"],
                                      "updatedAt": revision["timestamp"],
                                      "fields": infobox_fields(source), "sourceWikitext": source}
        write("item-pages.json", result)
        print(f"Detail pages: {len(result)}/{len(titles)}")
    return result


def image_info(names):
    images = read("image-info.json", {})
    remaining = sorted(name for name in set(names) if name not in images or not images[name].get("url"))
    for batch in batches(remaining, 15):
        for attempt in range(5):
            try:
                response = api(action="query", prop="imageinfo", iiprop="url|size|mime",
                               titles="|".join(f"File:{name}" for name in batch))
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(3 * (attempt + 1))
        for page in response["query"]["pages"]:
            file = page["title"].removeprefix("File:")
            info = page.get("imageinfo", [{}])[0]
            images[file] = {"url": info.get("url"), "width": info.get("width"),
                            "height": info.get("height"), "bytes": info.get("size"),
                            "mime": info.get("mime")}
        write("image-info.json", images)
        print(f"Image metadata: {len(images)}/{len(names)}", flush=True)
    return images


def download_images(images):
    assets = read("asset-manifest.json", {})
    directory = OUTPUT / "assets"
    directory.mkdir(parents=True, exist_ok=True)
    for index, (name, info) in enumerate(images.items(), 1):
        url = info.get("url")
        if not url:
            continue
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)[:100]
        digest = hashlib.sha256(url.encode()).hexdigest()[:12]
        path = directory / f"{digest}-{safe}"
        if not path.is_file():
            for attempt in range(5):
                try:
                    response = SESSION.get(url, timeout=90)
                    response.raise_for_status()
                    path.write_bytes(response.content)
                    if info.get("mime") != "image/svg+xml":
                        with Image.open(path) as image:
                            image.verify()
                    break
                except Exception:
                    path.unlink(missing_ok=True)
                    if attempt == 4:
                        raise
                    time.sleep(3 * (attempt + 1))
        payload = path.read_bytes()
        assets[name] = {"path": str(path.relative_to(OUTPUT)).replace("\\", "/"),
                        "url": url, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
        if index % 25 == 0:
            write("asset-manifest.json", assets)
            print(f"Downloaded: {len(assets)}/{len(images)}")
    write("asset-manifest.json", assets)
    return assets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--refresh-equipment", action="store_true")
    options = parser.parse_args()
    if options.inventory:
        inventory()
        return
    if options.refresh_equipment:
        refresh_equipment()
        return
    records = read("catalog-rows.json", []) if options.resume else snapshot_catalogs()
    details = read("item-pages.json", {}) if options.resume else detail_pages(records)
    names = {record["imageFile"] for record in records if record["imageFile"]}
    for title, page in details.items():
        if page.get("missing"):
            continue
        image = page["fields"].get("images", "")
        if image:
            names.add(resolved_image_name(image, title))
    images = image_info(names)
    if not options.skip_images:
        download_images(images)
    print(f"Snapshot: {len(records)} table rows, {len(details)} item pages, {len(images)} image files")


if __name__ == "__main__":
    main()
