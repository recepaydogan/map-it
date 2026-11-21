"""Capture and prepare the wiki's quests, sets, and survivor pages."""

from __future__ import annotations

import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import requests
from bs4 import BeautifulSoup, Tag


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research" / "enshrouded-wiki" / "progression"
PUBLIC = ROOT / "public" / "data" / "enshrouded"
API = "https://enshrouded.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)"}
MAP_MARKER_ALIASES = {
    "GlenwoodsEnd": "GlennwoodsEnd",
    "GatesToThePillarsOfCreation": "GateToThePillarsOfCreation",
    "Highlands-ResearchCamp": "ResearchCamp",
    "ChesterLoftInCromville": "ChesterLoftInCromville-1",
    "AbandonedHunterCamp-1": "AbandonedHunterCamp1",
    "SacrificalVukahPit": "SacrificialVukahPit",
    "Ancient Vault - Blacksmith": "AncientVault-Blacksmith",
    "Ancient Vault - Farmer": "AncientVault-Farmer",
    "Ol' Captain's Rest": "OlCaptainsRest",
    "HiddenTemple": "HiddenTemple-Blackmire1",
    "WolfCave": "Springlands-Cave1",
    "OutpostDrifa": "GatewayOutpostDrifa",
}


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def api(**params):
    for attempt in range(4):
        try:
            response = requests.get(API, params={"format": "json", "formatversion": 2, **params},
                                    headers=HEADERS, timeout=45)
            if response.status_code == 429:
                wait = response.headers.get("Retry-After")
                time.sleep(max(float(wait) if wait and wait.isdigit() else 0, 10 * (attempt + 1)))
                continue
            response.raise_for_status()
            value = response.json()
            if "error" in value:
                raise RuntimeError(value["error"])
            return value
        except (requests.RequestException, ValueError, RuntimeError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def category_members(name: str):
    result = []
    continuation = {}
    while True:
        page = api(action="query", list="categorymembers", cmtitle=f"Category:{name}",
                   cmlimit="max", **continuation)
        result.extend(item["title"] for item in page["query"]["categorymembers"] if item["ns"] == 0)
        if "continue" not in page:
            break
        continuation = page["continue"]
    return sorted(set(result))


def parsed_page(title: str):
    parsed = api(action="parse", page=title, prop="text|revid")["parse"]
    return {"revision": parsed["revid"], "html": parsed["text"]}


def existing_pages(titles: set[str]):
    result = set()
    ordered = sorted(titles)
    for index in range(0, len(ordered), 50):
        page = api(action="query", titles="|".join(ordered[index:index + 50]))
        result.update(item["title"] for item in page["query"]["pages"] if "missing" not in item)
    return result


def title_from_link(href: str | None):
    if not href:
        return None, None
    url = urlparse(href)
    if not url.path.startswith("/wiki/"):
        return None, None
    title = unquote(url.path.removeprefix("/wiki/")).replace("_", " ")
    if title.startswith(("File:", "Category:", "Special:", "Template:")):
        return None, None
    marker = parse_qs(url.query).get("marker", [None])[0]
    return title, MAP_MARKER_ALIASES.get(marker, marker)


def links(element: Tag):
    result = []
    for anchor in element.find_all("a", href=True):
        title, marker = title_from_link(anchor["href"])
        label = anchor.get_text(" ", strip=True)
        if title and label:
            value = {"page": title, "label": label}
            if marker:
                value["markerId"] = marker
            if value not in result:
                result.append(value)
    return result


def clean(value: str):
    return re.sub(r"\s+", " ", value).strip()


def label(element: Tag):
    return clean(re.sub(r"\[\s*(?:visual editing\s*\|\s*)?edit source\s*\]", "",
                        element.get_text(" ", strip=True), flags=re.I))


def table_block(table: Tag):
    direct_rows = [row for row in table.find_all("tr") if row.find_parent("table") is table]
    if not direct_rows:
        return None
    headers = [clean(cell.get_text(" ", strip=True)) for cell in direct_rows[0].find_all(["th", "td"], recursive=False)]
    rows = []
    for row in direct_rows[1:]:
        cells = row.find_all(["th", "td"], recursive=False)
        if cells:
            values = [clean(cell.get_text(" ", strip=True)) for cell in cells]
            if values == headers:
                continue
            rows.append([{"text": value, "links": links(cell)} for value, cell in zip(values, cells)])
    return {"kind": "table", "headers": headers, "rows": rows}


def sections(soup: BeautifulSoup):
    root = soup.select_one(".mw-parser-output") or soup
    result = []
    current = {"title": "Overview", "blocks": []}
    for element in root.children:
        if not isinstance(element, Tag):
            continue
        if element.name in ("h2", "h3", "h4"):
            if current["blocks"]:
                result.append(current)
            current = {"title": label(element), "blocks": []}
        elif element.name in ("p", "ul", "ol", "dl"):
            if element.name == "p":
                text = clean(element.get_text(" ", strip=True))
                if text and not re.match(r"This article is about the quest\. For the item, see ", text, re.I):
                    current["blocks"].append({"kind": "text", "text": text, "links": links(element)})
            else:
                parts = element.find_all(["li", "dd"], recursive=False)
                if element.name == "dl" and not parts:
                    parts = element.find_all(["dt"], recursive=False)
                items = [{"text": clean(part.get_text(" ", strip=True)), "links": links(part)}
                         for part in parts if clean(part.get_text(" ", strip=True))]
                if items:
                    current["blocks"].append({"kind": "list", "items": items})
        elif element.name == "table" and "wikitable" in element.get("class", []):
            block = table_block(element)
            if block:
                current["blocks"].append(block)
        elif element.name == "div" and "mw-collapsible" in element.get("class", []) \
                and "ranger-navbox" not in element.get("class", []):
            heading = element.find(["h2", "h3", "h4"])
            if heading:
                if current["blocks"]:
                    result.append(current)
                current = {"title": label(heading), "blocks": []}
            for table in element.find_all("table"):
                block = table_block(table)
                if block and block["rows"]:
                    current["blocks"].append(block)
    if current["blocks"]:
        result.append(current)
    return result


def infobox(soup: BeautifulSoup):
    box = soup.select_one(".druid-infobox")
    if not box:
        return {"description": None, "imageFile": None, "facts": []}
    image_link = box.select_one('.druid-main-image a[href^="/wiki/File:"]')
    image_file = unquote(image_link["href"].split("File:", 1)[1]).replace("_", " ") if image_link else None
    description = box.select_one(".druid-row-description .druid-data")
    facts = []
    for row in box.select(".druid-row"):
        heading = row.select_one(".druid-label")
        value = row.select_one(".druid-data")
        if heading and value:
            facts.append({"name": clean(heading.get_text(" ", strip=True)),
                          "value": clean(value.get_text(" ", strip=True)), "links": links(value)})
    return {"description": clean(description.get_text(" ", strip=True)) if description else None,
            "imageFile": image_file, "facts": facts}


def index_quests(soup: BeautifulSoup):
    root = soup.select_one(".mw-parser-output") or soup
    groups = {}
    group = "Other"
    for element in root.children:
        if not isinstance(element, Tag):
            continue
        if element.name in ("h2", "h3"):
            name = re.sub(r"\s*\(\d+\)$", "", label(element))
            if name != "Lore Quests":
                group = name
        elif element.name in ("ul", "ol", "dl"):
            for link in links(element):
                if link["page"].startswith("Quests/"):
                    groups[link["page"]] = group
    return groups


def index_sets(soup: BeautifulSoup):
    return sorted({link["page"] for link in links(soup) if link["page"].startswith("Sets/")})


def set_records(page: str, soup: BeautifulSoup):
    records = []
    for table in soup.select("table.wikitable"):
        for row in table.find_all("tr"):
            if row.find_parent("table") is not table:
                continue
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) not in (4, 5) or cells[0].name == "th":
                continue
            offset = len(cells) - 4
            members = []
            for item in cells[3 + offset].find_all("li"):
                text = clean(item.get_text(" ", strip=True))
                entry_links = links(item)
                target = next((link for link in entry_links if link["page"] != "Map"), None)
                image = item.find("img")
                image_file = None
                if image:
                    image_path = urlparse(image.get("src", "")).path
                    image_file = image_path.split("/thumb/", 1)[-1].split("/", 1)[0] \
                        if "/thumb/" in image_path else Path(image_path).name
                members.append({"name": target["label"] if target else text,
                                "page": target["page"] if target else None,
                                "imageFile": unquote(image_file).replace("_", " ") if image_file else None})
            if not members:
                members = [{"name": link["label"], "page": link["page"], "imageFile": None}
                           for link in links(cells[3 + offset])]
            records.append({"id": f"{page}:{clean(cells[0].get_text(' ', strip=True))}",
                            "name": clean(cells[0].get_text(" ", strip=True)),
                            "group": page.removeprefix("Sets/").replace("_", " "),
                            "region": clean(cells[1].get_text(" ", strip=True)) if offset else None,
                            "reward": clean(cells[1 + offset].get_text(" ", strip=True)),
                            "declaredCount": clean(cells[2 + offset].get_text(" ", strip=True)),
                            "items": members, "sourcePage": page})
    return records


def known_images():
    result = {}
    building = read_json(PUBLIC / "building-catalog.json", {"records": []})
    for record in building["records"]:
        icon = record.get("icon") or {}
        if icon.get("file") and icon.get("path"):
            result[icon["file"].casefold()] = icon["path"]
    wiki = read_json(PUBLIC / "wiki-catalog.json", {"records": []})
    for record in wiki["records"]:
        if record.get("icon"):
            result[record["name"].casefold() + ".png"] = record["icon"]
    crafting = read_json(PUBLIC / "crafting-catalog.json", {})
    for record in crafting.get("items", []):
        if record.get("imagePath"):
            for name in (record.get("name"), record.get("page")):
                if name:
                    result[name.casefold() + ".png"] = record["imagePath"]
    return result


def content_pages():
    pages = set(read_json(PUBLIC / "wiki-page-index.json", []))
    pages.update(read_json(PUBLIC / "building-page-index.json", []))
    crafting = read_json(PUBLIC / "crafting-page-index.json", {})
    for names in crafting.values():
        pages.update(names)
    return {name.replace("_", " ").casefold() for name in pages}


def reward_icons(quests, sets, npcs):
    wanted = {link["page"].replace("_", " ").casefold()
              for quest in quests for section in quest["sections"] for block in section["blocks"]
              for item in block.get("items", []) if item["text"].lower().startswith("reward")
              for link in item["links"]}
    result = {}

    def add(names, path):
        if not path:
            return
        for name in names:
            if name and name.replace("_", " ").casefold() in wanted:
                result[name.replace("_", " ").casefold()] = path

    wiki = read_json(PUBLIC / "wiki-catalog.json", {"records": []})
    for record in wiki["records"]:
        add((record.get("id"), record.get("name")), record.get("icon"))
    building = read_json(PUBLIC / "building-catalog.json", {"records": []})
    for record in building["records"]:
        icon = record.get("icon") or {}
        add((record.get("id"), record.get("name")), icon.get("path"))
    crafting = read_json(PUBLIC / "crafting-catalog.json", {})
    for key in ("items", "materials", "stations"):
        for record in crafting.get(key, []):
            add((record.get("page"), record.get("name")), record.get("imagePath"))
    for entry in sets:
        for item in entry["items"]:
            add((item.get("page"), item["name"]), item.get("image"))
    for entry in npcs:
        add((entry["id"], entry["name"], entry["role"]), entry.get("image"))
    return result


def resolve_images(files: set[str], known: dict[str, str]):
    missing = sorted(file for file in files if file and file.casefold() not in known)
    image_info = read_json(RESEARCH / "image-info.json", {})
    for index in range(0, len(missing), 40):
        batch = [name for name in missing[index:index + 40] if name not in image_info]
        if not batch:
            continue
        response = api(action="query", prop="imageinfo", iiprop="url|size|mime",
                       titles="|".join("File:" + name for name in batch))
        for page in response["query"]["pages"]:
            name = page["title"].removeprefix("File:")
            image_info[name] = (page.get("imageinfo") or [{}])[0]
        write_json(RESEARCH / "image-info.json", image_info)
    downloaded = read_json(RESEARCH / "asset-manifest.json", {})
    for name in missing:
        info = image_info.get(name) or image_info.get(name.replace("_", " ")) or {}
        url = info.get("url")
        if not url:
            continue
        suffix = Path(urlparse(url).path).suffix.lower()
        if suffix not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            continue
        filename = hashlib.sha256(name.casefold().encode("utf-8")).hexdigest()[:20] + suffix
        destination = PUBLIC / "progression-images" / filename
        if not destination.is_file():
            response = requests.get(url, headers=HEADERS, timeout=45)
            response.raise_for_status()
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(response.content)
            downloaded[name] = {"url": url, "path": f"data/enshrouded/progression-images/{filename}",
                                "bytes": len(response.content),
                                "sha256": hashlib.sha256(response.content).hexdigest()}
        known[name.casefold()] = f"data/enshrouded/progression-images/{filename}"
    write_json(RESEARCH / "asset-manifest.json", downloaded)
    return known


def main():
    RESEARCH.mkdir(parents=True, exist_ok=True)
    quest_titles = category_members("Quests")
    npc_groups = {key: category_members(key.title()) for key in ("craftspeople", "assistants", "villagers")}
    cache = read_json(RESEARCH / "page-cache.json", {})
    for title in ("Quests", "Sets", "Survivors"):
        if title not in cache:
            cache[title] = parsed_page(title)
    quest_groups = index_quests(BeautifulSoup(cache["Quests"]["html"], "html.parser"))
    set_pages = index_sets(BeautifulSoup(cache["Sets"]["html"], "html.parser"))
    npc_titles = {title: group for group, titles in npc_groups.items() for title in titles}
    needed = sorted(title for title in set(quest_titles + set_pages + list(npc_titles))
                    if "html" not in cache.get(title, {}))
    print(f"Fetching {len(needed)} uncached pages of {len(quest_titles)} quests, {len(set_pages)} set groups, {len(npc_titles)} NPCs", flush=True)
    with ThreadPoolExecutor(max_workers=1) as pool:
        tasks = {pool.submit(parsed_page, title): title for title in needed}
        for index, task in enumerate(as_completed(tasks), 1):
            title = tasks[task]
            try:
                cache[title] = task.result()
            except Exception as error:
                cache[title] = {"error": str(error)}
            if index % 20 == 0 or index == len(needed):
                write_json(RESEARCH / "page-cache.json", cache)
                print(f"Captured {index}/{len(needed)} pages", flush=True)
    write_json(RESEARCH / "page-cache.json", cache)
    survivor_index = BeautifulSoup(cache["Survivors"]["html"], "html.parser")
    npc_names = {}
    for anchor in survivor_index.find_all("a", href=True):
        title, _ = title_from_link(anchor["href"])
        if title in npc_titles and title not in npc_names:
            npc_names[title] = clean(anchor.get_text(" ", strip=True))
    quests = []
    for title in quest_titles:
        page = cache.get(title, {})
        if "html" not in page:
            continue
        soup = BeautifulSoup(page["html"], "html.parser")
        quests.append({"id": title, "name": title.removeprefix("Quests/"),
                       "group": quest_groups.get(title, "Other Quests"),
                       "sections": sections(soup), "revision": page["revision"]})
    sets = []
    for title in set_pages:
        page = cache.get(title, {})
        if "html" in page:
            sets.extend(set_records(title, BeautifulSoup(page["html"], "html.parser")))
    known_pages = content_pages()
    missing_set_pages = {item["page"] for entry in sets for item in entry["items"]
                         if item["page"] and item["page"].replace("_", " ").casefold() not in known_pages}
    available_set_pages = {title.casefold() for title in existing_pages(missing_set_pages)}
    uncached_set_pages = sorted(title for title in missing_set_pages
                                if title.casefold() in available_set_pages and "html" not in cache.get(title, {}))
    print(f"Fetching {len(uncached_set_pages)} uncached set item pages", flush=True)
    for index, title in enumerate(uncached_set_pages, 1):
        try:
            cache[title] = parsed_page(title)
        except Exception as error:
            cache[title] = {"error": str(error)}
        if index % 20 == 0 or index == len(uncached_set_pages):
            write_json(RESEARCH / "page-cache.json", cache)
            print(f"Captured {index}/{len(uncached_set_pages)} set item pages", flush=True)
    npcs = []
    files = {"Quest marker.png"}
    crafting_item_names = set()
    for title, group in npc_titles.items():
        page = cache.get(title, {})
        if "html" not in page:
            continue
        soup = BeautifulSoup(page["html"], "html.parser")
        info = infobox(soup)
        if info["imageFile"]:
            files.add(info["imageFile"])
        npc_sections = sections(soup)
        for section in npc_sections:
            for block in section["blocks"]:
                if block["kind"] == "table" and "Ingredients" in block.get("headers", []):
                    for row in block["rows"]:
                        crafting_item_names.update(link["page"] for cell in row[:2] for link in cell["links"])
        quest_links = [link["page"] for section in npc_sections for block in section["blocks"]
                       for link in (block.get("links") or [])
                       if link["page"].startswith("Quests/")]
        quest_links.extend(link["page"] for section in npc_sections for block in section["blocks"]
                           for item in (block.get("items") or []) for link in item["links"]
                           if link["page"].startswith("Quests/"))
        quest_links.extend(quest["id"] for quest in quests
                           if quest["group"].casefold() == f"{npc_names.get(title, title)} Quests".casefold())
        npcs.append({"id": title, "name": npc_names.get(title) or title,
                     "role": title, "group": group, **info,
                     "sections": npc_sections, "quests": list(dict.fromkeys(quest_links)),
                     "revision": page["revision"]})
    files.update(item["imageFile"] for entry in sets for item in entry["items"] if item["imageFile"])
    files.update(name + ".png" for name in crafting_item_names)
    images = resolve_images(files, known_images())
    for entry in npcs:
        entry["image"] = images.get((entry.pop("imageFile") or "").casefold())
    for entry in sets:
        for item in entry["items"]:
            item["image"] = images.get((item.pop("imageFile") or "").casefold())
    set_items_by_name = {}
    for entry in sets:
        for item in entry["items"]:
            name = item["page"] or item["name"]
            if name.replace("_", " ").casefold() in known_pages:
                continue
            record = set_items_by_name.setdefault(name, {"id": name, "name": item["name"],
                                                         "group": entry["group"], "image": item["image"],
                                                         "relatedSets": [], "facts": [], "sections": []})
            if not record["image"] and item["image"]:
                record["image"] = item["image"]
            if entry["id"] not in record["relatedSets"]:
                record["relatedSets"].append(entry["id"])
    for name, record in set_items_by_name.items():
        page = cache.get(name, {})
        if "html" in page:
            soup = BeautifulSoup(page["html"], "html.parser")
            info = infobox(soup)
            record["description"] = info["description"]
            record["facts"] = info["facts"]
            record["sections"] = sections(soup)
            record["revision"] = page["revision"]
    reward_image_paths = reward_icons(quests, sets, npcs)
    crafting_image_paths = {name: images[name.casefold() + ".png"] for name in crafting_item_names
                            if name.casefold() + ".png" in images}
    write_json(PUBLIC / "progression-catalog.json", {
        "schemaVersion": 1, "capturedAt": datetime.now(timezone.utc).isoformat(),
        "questIcon": images.get("quest marker.png"),
        "rewardIcons": reward_image_paths, "craftingIcons": crafting_image_paths,
        "quests": quests, "sets": sets, "setItems": list(set_items_by_name.values()), "npcs": npcs})
    write_json(PUBLIC / "progression-page-index.json", {
        "quests": [{"id": item["id"], "name": item["name"]} for item in quests],
        "sets": [{"id": item["id"], "name": item["name"]} for item in sets],
        "setItems": [{"id": item["id"], "name": item["name"]} for item in set_items_by_name.values()],
        "npcs": [{"id": item["id"], "name": item["name"], "role": item["role"]} for item in npcs],
    })
    write_json(RESEARCH / "scope.json", {"questTitles": quest_titles, "setPages": set_pages,
                                           "npcGroups": npc_groups,
                                           "questGroupCounts": {group: sum(q["group"] == group for q in quests)
                                                                for group in sorted({q["group"] for q in quests})}})
    print(f"Prepared {len(quests)} quests, {len(sets)} sets, {len(npcs)} NPCs", flush=True)


if __name__ == "__main__":
    main()
