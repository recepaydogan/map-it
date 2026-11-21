"""Build the runtime Enshrouded wiki catalog from the saved research snapshot."""

from __future__ import annotations

import html
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research" / "enshrouded-wiki" / "next-catalogs"
DEST = ROOT / "public" / "data" / "enshrouded"


def load(name):
    return json.loads((RESEARCH / name).read_text(encoding="utf-8"))


def plain(value):
    if value is None:
        return None
    text = html.unescape(str(value)).replace("<br>", " · ").replace("<br/>", " · ").replace("<br />", " · ")
    text = re.sub(r"\[\[File:[^]]+\]\]", "", text, flags=re.I)
    text = re.sub(r"\[\[[^]|]+\|([^]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^]]+)\]\]", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\{\{[^{}]+\}\}", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ·,")
    return text or None


ACQUISITION_SECTION = re.compile(
    r"^==\s*(?:Obtaining|Source|Sources|Dropped From)\s*==\s*(.*?)(?=^==[^=]|\Z)",
    flags=re.I | re.M | re.S,
)


def article_obtaining(source, page):
    """Use the item's own acquisition section before a catalog table summary."""
    match = ACQUISITION_SECTION.search(source or "")
    if not match:
        return None
    section = re.split(r"\[\[(?:Category|[a-z]{2,3}):", match.group(1), maxsplit=1, flags=re.I)[0]
    section = re.split(r"^===+\s*[^=]+\s*===+", section, maxsplit=1, flags=re.M)[0]
    section = re.sub(r"\{\{DataQuery/[^{}]+\}\}", "", section, flags=re.I)
    blocks = [block.strip() for block in re.split(r"\n\s*\n", section) if block.strip()]
    if not blocks:
        return None
    section = blocks[0]

    def template(match):
        parts = [part.strip() for part in match.group(1).split("|")]
        name = parts[0].casefold()
        values = [part for part in parts[1:] if "=" not in part]
        if name in ("pagename", "subpagename"):
            return page.split("/")[-1]
        if name == "maplink":
            return values[-1] if len(values) > 1 else ""
        if name.startswith(("item+", "quest+", "lore+")):
            return (("the quest " if name == "quest+the" else "") + values[0]) if values else ""
        return ""

    for _ in range(5):
        updated = re.sub(r"\{\{([^{}]+)\}\}", template, section)
        if updated == section:
            break
        section = updated
    section = re.sub(r"\[\[File:[^]]+\]\]", "", section, flags=re.I)
    section = re.sub(r"\[\[[^]|]+\|([^]]+)\]\]", r"\1", section)
    section = re.sub(r"\[\[([^]]+)\]\]", r"\1", section)
    section = re.sub(r"\[[a-z]+://\S+\s+([^]]+)\]", r"\1", section)
    section = re.sub(r"'{2,}", "", section)
    section = re.sub(r"\s*\|\|\s*", " · ", section)
    section = re.sub(r"<[^>]+>", "", section)
    section = re.sub(r"\s+", " ", section).strip(" ·,;*#")
    return section if section and section.casefold() not in ("n/a", "none", "unknown") else None


def article_lead_obtaining(source, page):
    """Recover a source sentence when the page has no acquisition heading."""
    if not source:
        return None
    position = 0
    if source.startswith("{{"):
        depth = 0
        for index in range(len(source) - 1):
            pair = source[index:index + 2]
            if pair == "{{":
                depth += 1
            elif pair == "}}":
                depth -= 1
                if depth == 0:
                    position = index + 2
                    break
    lead = re.split(r"^==[^=]", source[position:], maxsplit=1, flags=re.M)[0]
    for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z{])", lead):
        if re.search(r"\b(?:can be|is|are)\s+(?:found|obtained|looted|dropped)\b", sentence, re.I):
            return article_obtaining("== Obtaining ==\n" + sentence, page)
    return None


def asset_path(value, assets):
    if not value or value not in assets:
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:72]
    filename = f"{assets[value]['sha256'][:12]}-{slug}.webp"
    source = RESEARCH / assets[value]["path"]
    target = DEST / "wiki-icons" / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        try:
            with Image.open(target) as existing:
                existing.verify()
        except (OSError, ValueError):
            target.unlink()
    if not target.exists():
        with Image.open(source) as original:
            icon = original.convert("RGBA")
            icon.thumbnail((160, 160), Image.Resampling.LANCZOS)
            icon.save(target, "WEBP", quality=84, method=1)
    return f"data/enshrouded/wiki-icons/{filename}"


def clean_stats(stats):
    result = []
    seen = set()
    for template in stats:
        for key, value in template.get("fields", {}).items():
            if key in seen or key in ("weapon", "weapontype", "source"):
                continue
            clean = plain(value)
            if clean:
                result.append({"name": key, "value": clean})
                seen.add(key)
    return result


def table_recipe(value):
    """Recover table recipes missing from the linked item page."""
    match = re.search(r"Ingredients\s*:\s*(.*?)\s+Workstations?\s*:\s*(.*?)\s+Craft Time\s*:\s*(.*?)\s+Product\s*:\s*(.*)",
                      value, flags=re.I)
    if not match:
        return None
    parts = []
    for item in match.group(1).split(","):
        ingredient = re.fullmatch(r"\s*(.*?)\s+x(\d+)\s*", item)
        if ingredient:
            parts.append({"name": ingredient.group(1), "quantity": ingredient.group(2)})
    product = re.search(r"\bx(\d+)\s*$", match.group(4))
    return {"ingredients": parts, "workstations": [name.strip() for name in match.group(2).split("+") if name.strip()],
            "craftTime": match.group(3).strip() or None,
            "productQuantity": product.group(1) if product else None}


def main():
    rows = load("catalog-items.json")
    details = load("item-details.json")
    pages = load("item-pages.json")
    assets = load("asset-manifest.json")
    crafting_items = json.loads((DEST / "crafting-catalog.json").read_text(encoding="utf-8"))["items"]
    crafting_icons = {item["name"].casefold(): item.get("imagePath") for item in crafting_items}
    records = {}
    for row in rows:
        page = row["page"] or row["name"]
        if row["catalog"] == "equipment" and page.endswith(" Set"):
            continue
        detail = details.get(page, {})
        if page in records:
            if row["sourcePage"] not in records[page]["groups"]:
                records[page]["groups"].append(row["sourcePage"])
            continue
        info = detail.get("infobox", {})
        column_values = {column["heading"].lower(): plain(column["text"])
                         for column in row["columns"][1:] if column.get("heading")}
        stats = clean_stats(detail.get("stats", []))
        recipes = []
        for recipe in detail.get("crafting", []):
            stations = list(dict.fromkeys(filter(None, [plain(recipe.get("crafter")),
                                                       plain(recipe.get("fields", {}).get("workshop"))])))
            recipes.append({
                "ingredients": [{"name": plain(part["name"]) or part["name"],
                                 "quantity": plain(part.get("quantity"))} for part in recipe["ingredients"]],
                "workstations": stations,
                "craftTime": plain(recipe.get("craftTime")),
                "productQuantity": plain(recipe.get("quantity")),
            })
        infobox_station = info.get("crafter") or info.get("workshop")
        if not recipes and infobox_station and info.get("ingredients"):
            ingredients = [re.fullmatch(r"\s*(.*?)\s*:\s*(\d+)\s*", part)
                           for part in info["ingredients"].split(",")]
            if all(ingredients):
                recipes.append({"ingredients": [{"name": part.group(1), "quantity": part.group(2)}
                                                for part in ingredients],
                                "workstations": [plain(infobox_station)],
                                "craftTime": plain(info.get("crafting time")), "productQuantity": "1"})
        acquisition = next((column for column in row["columns"] if (column.get("heading") or "").lower()
                            in ("obtained by", "resources", "resources/where to obtain")
                            or (column.get("heading") or "").lower() == "materials"
                            and "Ingredients :" in column.get("text", "")), None)
        acquisition_text = plain(acquisition["text"]) if acquisition else None
        if acquisition_text and "Ingredients :" in acquisition_text and not recipes:
            recovered = table_recipe(acquisition_text)
            if recovered:
                recipes.append(recovered)
        source_wikitext = pages.get(page, {}).get("sourceWikitext")
        obtaining = article_obtaining(source_wikitext, page) or article_lead_obtaining(source_wikitext, page)
        if not obtaining and acquisition_text and "Ingredients :" not in acquisition_text \
                and acquisition_text.casefold() not in ("n/a", "none", "unknown"):
            obtaining = acquisition_text
        if not obtaining:
            obtaining = plain(info.get("source")) or next((plain(value) for stat in detail.get("stats", [])
                              for name, value in stat.get("fields", {}).items()
                              if name.casefold() == "source" and plain(value)), None)
        if not obtaining:
            obtaining = column_values.get("location")
        attributes = []
        fact_names = {"type", "rarity", "level", "stack size", "comfort"}
        for column in row["columns"][1:]:
            heading = column.get("heading")
            if not heading or heading.lower() in ("materials", "obtained by", "resources", "resources/where to obtain", "crafting"):
                continue
            if heading.lower() in fact_names:
                continue
            value = plain(column["text"])
            if value:
                attributes.append({"name": heading, "value": value})
        related = list(dict.fromkeys(link for column in row["columns"] for link in column["links"]
                                     if link != page))
        record = {
            "id": page,
            "name": row["name"],
            "catalog": row["catalog"],
            "groups": [row["sourcePage"]],
            "section": row["section"],
            "icon": asset_path(row["imageFile"], assets) or crafting_icons.get(page.casefold()),
            "description": plain(info.get("description")),
            "type": column_values.get("type") or plain(info.get("type")),
            "rarity": column_values.get("rarity") or plain(info.get("rarity")),
            "level": column_values.get("level") or plain(info.get("level")),
            "stackSize": column_values.get("stack size") or plain(info.get("stack size")),
            "comfort": column_values.get("comfort") or plain(info.get("comfort")),
            "obtaining": obtaining,
            "attributes": attributes,
            "stats": [stat for stat in stats if stat["name"] not in {item["name"].lower() for item in attributes}],
            "recipes": recipes,
            "related": related,
        }
        records[page] = record
    duplicate_names = Counter(record["name"] for record in records.values())
    for record in records.values():
        if duplicate_names[record["name"]] > 1:
            record["name"] = record["id"]
    building_pages = set(json.loads((DEST / "building-page-index.json").read_text(encoding="utf-8")))
    wiki_uses = defaultdict(set)
    for record in records.values():
        for recipe in record["recipes"]:
            for name in [*(part["name"] for part in recipe["ingredients"]), *recipe["workstations"]]:
                if name in building_pages:
                    wiki_uses[name].add(record["id"])
    # Include ingredient and workstation pages when the building catalog already
    # references them; the UI resolves those through its cross-catalog links.
    catalog_order = {name: index for index, name in enumerate(("collectibles", "comfort", "decorations", "equipment"))}
    equipment_group_order = {name: index for index, name in enumerate((
        "Arrows", "Armor/Melee", "Armor/Magic", "Armor/Ranged", "Armor/Cosmetic", "Armor",
        "Backpacks", "Consumables", "Dyes", "Food", "Gems", "Gliders", "Rings",
        "Shields", "Spells", "Tools", "Weapons"))}
    ordered_records = sorted(records.values(), key=lambda record: (
        catalog_order[record["catalog"]],
        equipment_group_order.get(record["groups"][0], 99) if record["catalog"] == "equipment" else 0))
    payload = {"schemaVersion": 1, "records": ordered_records}
    (DEST / "wiki-catalog.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (DEST / "wiki-obtaining-index.json").write_text(json.dumps({page: record["obtaining"]
        for page, record in records.items() if record["obtaining"]}, ensure_ascii=False,
        separators=(",", ":")) + "\n", encoding="utf-8")
    (DEST / "wiki-page-index.json").write_text(json.dumps(list(records), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (DEST / "wiki-page-catalog-index.json").write_text(json.dumps({page: record["catalog"] for page, record in records.items()},
                                                         ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (DEST / "wiki-uses-index.json").write_text(json.dumps({page: sorted(items) for page, items in wiki_uses.items()},
                                                 ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Built {len(records)} wiki records; {sum(bool(x['icon']) for x in records.values())} icons")


if __name__ == "__main__":
    main()
