"""Publish profession summaries and all recipe rows from Warcraft Forever pages."""

import argparse
import json
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup


ORIGIN = "https://warcraftforever.games"
RESEARCH = Path("data/site-research/warcraft-forever-professions")
OUTPUT = Path("public/data/professions/catalog.json")
ICONS = Path("public/data/professions/icons")
ITEM_ICONS = Path("public/data/items/site-icons")
SLUGS = ("alchemy", "blacksmithing", "enchanting", "engineering", "herbalism",
         "leatherworking", "mining", "skinning", "tailoring", "cooking", "firstaid",
         "fishing", "camping")


def text(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def count(value):
    match = re.search(r"\d+", value)
    return int(match.group()) if match else 0


def item_id(node):
    if not node or not node.get("href"):
        return None
    match = re.fullmatch(r"/items/(\d+)", node["href"])
    return match.group(1) if match else None


def icon_name(node):
    if not node or "/icons/" not in node.get("src", ""):
        return None
    filename = urlparse(node["src"]).path.rsplit("/", 1)[-1]
    return filename if re.fullmatch(r"[a-zA-Z0-9_-]+\.jpg", filename) else None


def fetch(relative):
    request = urllib.request.Request(f"{ORIGIN}{relative}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf8")


def section(main, title):
    return next((candidate for candidate in main.select("section")
                 if candidate.find("h2") and text(candidate.find("h2")) == title), None)


def parse_index(html):
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main")
    records = {}
    for heading in main.select("h3"):
        link = heading.find("a", href=re.compile(r"^/professions/[a-z]+$"))
        if not link:
            continue
        slug = link["href"].rsplit("/", 1)[-1]
        if slug not in SLUGS:
            continue
        card = heading.find_parent("li", class_=re.compile("flex-col"))
        assert card, f"Missing index card for {slug}"
        group = heading.find_previous("h2")
        assert group and text(group) in ("Primary professions", "Secondary skills"), slug
        title_block = heading.parent
        bullets = [text(li) for li in card.select("ul.flex-1 > li")]
        note = next((text(p) for p in card.find_all("p", recursive=False)
                     if "border-t" in p.get("class", [])), "")
        records[slug] = {
            "id": slug,
            "name": text(heading),
            "kind": "primary" if text(group) == "Primary professions" else "secondary",
            "subtitle": text(title_block.find("p")),
            "changes": bullets,
            **({"note": note} if note else {}),
            **({"iconName": icon_name(card.find("img"))} if icon_name(card.find("img")) else {}),
        }
    assert set(records) == set(SLUGS), f"Index profession mismatch: {set(SLUGS) - set(records)}"
    return records


def parse_recipe(li, items, index):
    columns = li.find_all("span", recursive=False)
    assert len(columns) == 4, "Recipe row does not have four columns"
    skill_column, output_column, reagent_column, source_column = columns
    output_link = output_column.find("a", href=re.compile(r"^/items/\d+$"))
    output_id = item_id(output_link)
    output_name = text(output_link) if output_link else text(output_column.find("span"))
    output_item = items.get(output_id, {}) if output_id else {}
    if re.fullmatch(r"Item #\d+", output_name) and output_item.get("nameVerified"):
        output_name = output_item["name"]
    assert output_name, f"Recipe {index} has no output"
    output_icon = output_item.get("icon")
    materials = []
    for material in reagent_column.find_all("span", recursive=False):
        link = material.find("a", href=re.compile(r"^/items/\d+$"))
        assert link, f"Recipe {index} has an unlinked reagent"
        material_id = item_id(link)
        name = text(link)
        item = items.get(material_id, {})
        if re.fullmatch(r"Item #\d+", name) and item.get("nameVerified"):
            name = item["name"]
        quantity = re.search(r"×\s*(\d+)", text(material))
        assert quantity, f"Recipe {index} has a reagent without quantity"
        materials.append({"id": material_id, "name": name, "quantity": int(quantity.group(1)),
                          "inItemCatalog": material_id in items})
    source_link = source_column.find("a", href=re.compile(r"^/items/\d+$"))
    source_price = source_column.find("span", class_="block")
    source_label = text(source_link) if source_link else text(source_column).removesuffix(text(source_price)).strip()
    output_extra = text(output_column).removeprefix(output_name).strip()
    output_quantity = re.search(r"×\s*(\d+)", output_extra)
    camp_profession = re.search(r"\b(Alchemy|Blacksmithing|Enchanting|Engineering|Herbalism|Leatherworking|Mining|Skinning|Tailoring|Cooking|First Aid|Fishing)\b", output_extra)
    thresholds = [int(value) for value in re.findall(r"\d+", skill_column.get("title", ""))]
    classes = [name for name in output_item.get("allowedClasses", [])
               if name in ("Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid")]
    return {
        "id": f"{index}",
        **({"itemId": output_id} if output_id else {}),
        "inItemCatalog": output_id in items if output_id else False,
        "name": output_name,
        **({"icon": output_icon} if output_icon and (Path("public") / output_icon).exists() else {}),
        "skill": count(text(skill_column)),
        "estimatedSkill": "≈" in text(skill_column),
        **({"skillThresholds": thresholds} if len(thresholds) >= 2 else {}),
        "new": "New" in output_extra.split(),
        **({"quantity": int(output_quantity.group(1))} if output_quantity else {}),
        "reagents": materials,
        "source": source_label,
        **({"sourceItemId": item_id(source_link), "sourceItemAvailable": item_id(source_link) in items} if source_link else {}),
        **({"campProfession": camp_profession.group(1)} if camp_profession else {}),
        **({"classes": classes} if classes else {}),
    }


def parse_detail(slug, html, index, items):
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main")
    header = main.find("h1")
    assert header and text(header) == index["name"], f"Unexpected page title for {slug}"
    intro = header.parent.parent.parent
    changes = [text(li) for li in intro.select("ul > li")]
    assert changes == index["changes"], f"Index/detail changes disagree for {slug}"
    stats = {}
    for panel in next(candidate for candidate in main.select("section") if not candidate.find("h2")).find_all("div", recursive=False):
        labels = panel.find_all("p", recursive=False)
        if len(labels) == 2:
            stats[text(labels[0])] = text(labels[1])
    recipe_section = next(candidate for candidate in main.select("section")
                          if candidate.find("h2") and text(candidate.find("h2")).endswith("recipes"))
    recipe_rows = recipe_section.select("ul.divide-y > li")
    recipes = [parse_recipe(li, items, idx) for idx, li in enumerate(recipe_rows)]
    recipe_count = count(stats.get("Recipes", ""))
    new_count = count(stats.get("New in Forever", ""))
    assert len(recipes) == recipe_count == count(text(recipe_section.find("h2"))), (slug, len(recipes), recipe_count)
    assert sum(recipe["new"] for recipe in recipes) == new_count, f"New recipe count mismatch: {slug}"
    featured_section = section(main, "What's new")
    featured = []
    if featured_section:
        for li in featured_section.select("ul > li"):
            link = li.find("a", href=re.compile(r"^/items/\d+$"))
            caption = li.find("p")
            featured.append({
                **({"itemId": item_id(link)} if link else {}),
                "name": text(link) if link else text(li.find("span")),
                "skill": count(text(caption)),
                "estimatedSkill": "≈" in text(caption),
                "materials": text(caption).split("·", 1)[-1].strip() if "·" in text(caption) else "",
            })
    fixtures_section = section(main, "Camp fixtures")
    fixtures = []
    if fixtures_section:
        for li in fixtures_section.select("ul > li"):
            link = li.find("a", href=re.compile(r"^/items/\d+$"))
            label = li.find("span", class_=re.compile("ms-1"))
            fixtures.append({"name": text(link) if link else text(li).removesuffix(text(label)).strip(),
                             **({"itemId": item_id(link)} if link else {}),
                             "skill": count(text(li)), "estimatedSkill": "≈" in text(li)})
    camping_section = section(main, "Camping") if slug == "camping" else None
    camping = None
    if camping_section:
        camping = {
            "description": "Build a campfire outdoors. Other players can add profession features; everyone at camp shares the buffs.",
            "features": [
                "Each profession adds a different camp benefit.",
                "Camp features require a campfire and share a 1-hour cooldown.",
                "Blacksmithing: Sharpening Wheel (skill 20) grants +34 Strength nearby. Anvil (140) and Master Forge (300) replace it. The buff does not stack with Strength of Earth Totem.",
                "First Aid Kit (Linen Bandage + Refreshing Spring Water) adds a Fortitude-style buff.",
                "Reagent Economy removes Tier 1 reagent costs. Permanence extends camp benefits by 50%.",
            ],
        }
        index = {**index, "changes": [],
                 "note": "Whether Camping occupies a profession slot is unconfirmed."}
    return {
        **{key: value for key, value in index.items() if key != "iconName"},
        **({"icon": f"data/professions/icons/{index['iconName']}"} if index.get("iconName") else {}),
        "recipeCount": recipe_count,
        "newRecipeCount": new_count,
        "skillSpan": stats.get("Skill span", ""),
        **({"fixtureCount": count(stats["Camp fixtures"])} if "Camp fixtures" in stats else {}),
        "featured": featured,
        "fixtures": fixtures,
        **({"camping": camping} if camping else {}),
        "recipes": recipes,
    }


def download_icons(professions):
    names = {Path(profession["icon"]).name for profession in professions if profession.get("icon")}
    ICONS.mkdir(parents=True, exist_ok=True)

    def download(name):
        path = ICONS / name
        if path.exists() and path.stat().st_size > 100:
            return None
        if (ITEM_ICONS / name).exists():
            shutil.copyfile(ITEM_ICONS / name, path)
            return None
        for size in ("large", "medium"):
            try:
                request = urllib.request.Request(
                    f"https://wowforever-media.fly.storage.tigris.dev/icons/{size}/{name}",
                    headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=20) as response:
                    content = response.read()
                if len(content) > 100:
                    path.write_bytes(content)
                    return None
            except Exception:
                pass
        return name

    with ThreadPoolExecutor(max_workers=5) as pool:
        return [name for name in pool.map(download, sorted(names)) if name]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Refresh index and profession page snapshots")
    args = parser.parse_args()
    RESEARCH.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        (RESEARCH / "index.html").write_text(fetch("/professions"), encoding="utf8")
        with ThreadPoolExecutor(max_workers=4) as pool:
            pages = list(pool.map(lambda slug: fetch(f"/professions/{slug}"), SLUGS))
        for slug, html in zip(SLUGS, pages):
            (RESEARCH / f"{slug}.html").write_text(html, encoding="utf8")
    records = parse_index((RESEARCH / "index.html").read_text(encoding="utf8"))
    items = {item["id"]: item for item in json.loads(Path("public/data/items/catalog.json").read_text(encoding="utf8"))["items"]}
    professions = [parse_detail(slug, (RESEARCH / f"{slug}.html").read_text(encoding="utf8"), records[slug], items)
                   for slug in SLUGS]
    missing_icons = download_icons(professions)
    for profession in professions:
        if profession.get("icon") and Path(profession["icon"]).name in missing_icons:
            del profession["icon"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"version": 1, "source": f"{ORIGIN}/professions", "sourceBuild": "1.60.1.69893",
                                  "professions": professions}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Published {len(professions)} professions and {sum(len(p['recipes']) for p in professions)} recipe rows; "
          f"{len(missing_icons)} missing profession icons.")


if __name__ == "__main__":
    main()
