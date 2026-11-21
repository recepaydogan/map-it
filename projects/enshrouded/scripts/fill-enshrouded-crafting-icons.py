"""Fill missing NPC crafting product icons from verified item image sources."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "enshrouded"
ASSETS = DATA / "crafting-images"
OVERRIDES = DATA / "crafting-icon-supplements.json"
MANIFEST = ROOT / "research" / "enshrouded-wiki" / "crafting-icon-supplements-manifest.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; EnshroudedMapIconAudit/1.0)"}
ICON_ALIASES = {
    "Alpine Rose Plant Pot": "Alpine Rose Pot",
    "Heather Flower Plant Pot": "Heather Flower Pot",
    "Large Brittlebush Plant Pot": "Brittlebush Plant Pot",
    "Large Coconut Plant Pot": "Coconut Plant Pot",
    "Large Indigo Plant Pot": "Indigo Plant Pot",
    "Medium Aloe Plant Pot": "Aloe Plant Pot",
    "Medium Bamboo Plant": "Bamboo Plant Pot",
    "Medium Chamomile Plant Pot": "Chamomile Plant Pot",
    "Medium Flax Plant Pot": "Flax Plant Pot",
    "Medium Gentian Plant": "Gentian Plant Pot",
    "Medium Grapple Plant Flower Pot": "Grapple Plant Flower Pot",
    "Medium Saffron Plant": "Saffron Plant Pot",
    "Medium Sage Plant Pot": "Sage Plant Pot",
    "Medium Taro Plant": "Taro Plant Pot",
    "Medium Wolfsbane Plant": "Wolfsbane Plant Pot",
    "Small Decorated Tree I": "Small Decorated Tree",
    "Small Decorated Tree II": "Small Decorated Tree",
}


def read(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def key(name: str):
    return name.replace("_", " ").strip().casefold()


def existing_icons():
    images = {}

    def add(name, path):
        if name and path and (ROOT / "public" / path).is_file():
            images.setdefault(key(name), path)

    wiki = read(DATA / "wiki-catalog.json", {"records": []})
    crafting = read(DATA / "crafting-catalog.json", {"items": []})
    building = read(DATA / "building-catalog.json", {"records": []})
    progression = read(DATA / "progression-catalog.json", {})
    for record in wiki["records"]:
        add(record.get("id"), record.get("icon"))
        add(record.get("name"), record.get("icon"))
    for record in crafting["items"]:
        add(record.get("name"), record.get("imagePath"))
        add(record.get("page"), record.get("imagePath"))
    for record in building["records"]:
        add(record.get("name"), (record.get("icon") or {}).get("path"))
        add(record.get("sourcePage"), (record.get("icon") or {}).get("path"))
    for record in progression.get("setItems", []):
        add(record.get("name"), record.get("image"))
    for group in progression.get("sets", []):
        for item in group.get("items", []):
            add(item.get("name"), item.get("image"))
    for name, path in progression.get("rewardIcons", {}).items():
        add(name, path)
    for name, path in progression.get("craftingIcons", {}).items():
        add(name, path)
    for name, path in read(OVERRIDES, {}).items():
        add(name, path)
    return images, crafting, progression


def slug(name: str):
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("+", " plus ").replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", normalized.casefold()).strip("-")


def gaming_tools_icons():
    icons = {}
    for catalog in ("items", "structures", "workshops"):
        response = requests.get(f"https://enshrouded.gaming.tools/{catalog}",
                                headers=HEADERS, timeout=30)
        response.raise_for_status()
        for name, path in re.findall(r'\\"([^"\\]+)\\",\\"(/images/items/[^"\\]+-icon\.webp)\\"',
                                     response.text):
            icons[key(name)] = "https://cdn-hosted.gaming.tools/enshrouded" + path
    return icons


def download_icon(name: str, alternate_icons: dict[str, str]):
    session = requests.Session()
    session.headers.update(HEADERS)
    exact_icon = alternate_icons.get(key(name))
    if exact_icon:
        try:
            response = session.get(exact_icon, timeout=25)
            if response.ok and response.headers.get("content-type", "").startswith("image/"):
                return response.content, ".webp", exact_icon
        except requests.RequestException:
            pass
    wiki_url = "https://enshrouded.wiki.gg/images/" + quote(name.replace(" ", "_") + ".png")
    try:
        response = session.get(wiki_url, timeout=25)
        if response.ok and response.headers.get("content-type", "").startswith("image/"):
            return response.content, ".png", wiki_url
    except requests.RequestException:
        pass

    detail_url = "https://enshrouded.maxdps.com/items/" + slug(name)
    try:
        response = session.get(detail_url, timeout=25)
        if not response.ok:
            return None
        soup = BeautifulSoup(response.text, "html.parser")
        heading = soup.find("h1")
        if not heading or key(heading.get_text(" ", strip=True)) != key(name):
            return None
        icon = next((image for image in soup.find_all("img")
                     if image.get("src", "").startswith("https://enshrouded-assets.maxdps.com/")
                     and key(name) in key(image.get("alt", ""))), None)
        if not icon:
            return None
        icon_url = icon["src"]
        image_response = session.get(icon_url, timeout=25)
        if image_response.ok and image_response.headers.get("content-type", "").startswith("image/"):
            return image_response.content, ".webp", icon_url
    except requests.RequestException:
        pass
    return None


def main():
    existing, crafting, progression = existing_icons()
    roles = {npc["role"].removesuffix(" Assistant").casefold() for npc in progression["npcs"]}
    products = {recipe["output"]["name"] for recipe in crafting["recipes"]
                if any(station.casefold() in roles for station in recipe["stations"])}
    missing = sorted(name for name in products if key(name) not in existing)
    print(f"NPC products: {len(products)}; missing icons: {len(missing)}", flush=True)
    if not missing:
        return
    overrides = read(OVERRIDES, {})
    manifest = read(MANIFEST, {})
    alternate_icons = gaming_tools_icons()
    resolved = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(download_icon, name, alternate_icons): name for name in missing
                 if name not in ICON_ALIASES}
        for task in as_completed(tasks):
            name = tasks[task]
            try:
                image = task.result()
            except Exception as error:
                print(f"Could not fetch {name}: {error}", flush=True)
                continue
            if not image:
                continue
            content, suffix, url = image
            sha256 = hashlib.sha256(content).hexdigest()
            destination = ASSETS / f"{sha256[:20]}{suffix}"
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.is_file():
                destination.write_bytes(content)
            path = destination.relative_to(ROOT / "public").as_posix()
            overrides[name] = path
            manifest[name] = {"path": path, "bytes": len(content), "sha256": sha256, "sourceUrl": url}
            resolved += 1
            if resolved % 25 == 0:
                print(f"Resolved {resolved}/{len(missing)} missing icons", flush=True)
    for name, alias in ICON_ALIASES.items():
        path = existing.get(key(alias))
        if name in missing and path:
            overrides[name] = path
            manifest[name] = {"path": path, "aliasOf": alias,
                              "reason": "No distinct source icon available for this variant"}
            resolved += 1
    write(OVERRIDES, dict(sorted(overrides.items())))
    write(MANIFEST, dict(sorted(manifest.items())))
    remaining = sorted(name for name in missing if name not in overrides)
    print(f"Resolved {resolved} icons; {len(remaining)} source images unavailable", flush=True)
    if remaining:
        print("Still missing: " + ", ".join(remaining), flush=True)


if __name__ == "__main__":
    main()
