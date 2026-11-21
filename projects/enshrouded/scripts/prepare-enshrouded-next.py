"""Turn the saved wiki snapshot into linked research catalogs without editing the app."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote


OUTPUT = Path(__file__).resolve().parents[1] / "research" / "enshrouded-wiki" / "next-catalogs"


def read(name):
    return json.loads((OUTPUT / name).read_text(encoding="utf-8"))


def write(name, value):
    (OUTPUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def templates(source):
    """Read line-oriented wiki templates while preserving their unparsed values."""
    result = []
    current = None
    for line in source.splitlines():
        opening = re.match(r"^\s*\{\{\s*([^|{}]+?)\s*$", line)
        if opening and current is None:
            current = {"template": opening.group(1).strip().replace("_", " "), "fields": {}}
            continue
        if current is None:
            continue
        if re.match(r"^\s*\}\}\s*$", line):
            result.append(current)
            current = None
            continue
        field = re.match(r"^\s*\|\s*([^=]+?)\s*=\s*(.*)$", line)
        if field:
            current["fields"][field.group(1).strip().lower()] = field.group(2).strip()
    return result


def ingredients(text, known_pages):
    result = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        name, separator, quantity = part.rpartition(":")
        ingredient_name = name.strip() if separator else part
        result.append({"name": ingredient_name,
                       "quantity": quantity.strip() if separator else None,
                       "targetPage": ingredient_name if ingredient_name in known_pages else None})
    return result


def image_name(value, title):
    if not value:
        return None
    return " ".join(value.replace("{{PAGENAME}}", title)
                    .replace("{{SUBPAGENAME}}", title.rsplit("/", 1)[-1])
                    .replace("_", " ").split())


def section_name(value):
    return re.sub(r"\s*\[(?:\s*visual editing\s*\|)?\s*edit source\s*\]$", "", value,
                  flags=re.I).strip()


def main():
    rows = read("catalog-rows.json")
    pages = read("catalog-pages.json")
    details = read("item-pages.json")
    images = read("image-info.json")
    assets = read("asset-manifest.json") if (OUTPUT / "asset-manifest.json").exists() else {}
    item_details = {}
    for title, page in details.items():
        if page.get("missing"):
            item_details[title] = {"missing": True}
            continue
        parsed = templates(page["sourceWikitext"])
        crafting = []
        stats = []
        for item in parsed:
            kind = item["template"].lower()
            if kind == "crafting":
                fields = item["fields"]
                crafting.append({"ingredients": ingredients(fields.get("ingredients", ""), details),
                                 "workstation": fields.get("workshop") or fields.get("crafter"),
                                 "workstationPage": (fields.get("workshop") or fields.get("crafter"))
                                 if (fields.get("workshop") or fields.get("crafter")) in details else None,
                                 "crafter": fields.get("crafter"),
                                 "craftTime": fields.get("crafting time"),
                                 "quantity": fields.get("crafted quantity"),
                                 "fields": fields})
            elif kind.endswith("stats"):
                stats.append(item)
        image_file = image_name(page["fields"].get("images"), title)
        if not image_file and title + ".png" in assets:
            image_file = title + ".png"
        item_details[title] = {
            "wikiUrl": "https://enshrouded.wiki.gg/wiki/" + quote(title.replace(" ", "_"), safe="()/"),
            "revision": page["revision"], "updatedAt": page["updatedAt"],
            "infobox": page["fields"], "imageFile": image_file,
            "imageAsset": assets.get(image_file, {}).get("path"),
            "crafting": crafting, "stats": stats,
            "categories": re.findall(r"\[\[Category:([^]|]+)", page["sourceWikitext"]),
        }
    prepared = []
    for row in rows:
        if row["sourcePage"] in ("Comfort", "Equipment"):
            continue
        if row["section"] == "Index":
            detail = item_details.get(row["page"] or "", {})
            if not detail.get("infobox") and not detail.get("stats"):
                continue
        image_file = image_name(row["imageFile"], row["page"] or row["name"])
        image_file = image_file or item_details.get(row["page"] or "", {}).get("imageFile")
        item = item_details.get(row["page"] or "", {})
        display_name = row["page"] if row["name"].startswith("File:") and row["page"] else row["name"]
        prepared.append({
            "catalog": row["catalog"], "sourcePage": row["sourcePage"],
            "sourceRevision": pages[row["sourcePage"]]["revision"],
            "section": section_name(row["section"]), "name": display_name, "page": row["page"],
            "imageFile": image_file, "imageAsset": assets.get(image_file, {}).get("path"),
            "columns": [{"heading": row["headers"][i] if i < len(row["headers"]) else None,
                         "text": cell["text"], "links": cell["links"]}
                        for i, cell in enumerate(row["cells"])],
            "detailPage": row["page"] if item and not item.get("missing") else None,
        })
    write("item-details.json", item_details)
    write("catalog-items.json", prepared)
    print(f"Prepared {len(prepared)} catalog rows and {len(item_details)} linked page details")
    print(f"Crafting recipes: {sum(len(x.get('crafting', [])) for x in item_details.values())}")
    print(f"Catalog rows with local image: {sum(bool(x['imageAsset']) for x in prepared)}")


if __name__ == "__main__":
    main()
