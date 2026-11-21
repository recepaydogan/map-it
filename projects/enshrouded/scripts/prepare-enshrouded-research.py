"""Produce reviewable, locally linked catalogs from the captured wiki snapshot.

No app components read these research files. Run after both extract scripts.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[1] / "research" / "enshrouded-wiki"
BASE = "https://enshrouded.wiki.gg"


def read(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def write(name: str, value) -> None:
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    building = read("building-materials.json")
    images = read("building-images.json")
    assets = read("asset-manifest.json")["files"]
    map_markers = read("map-markers.json")["markers"]
    map_ids = {marker["id"] for marker in map_markers}
    related = read("related-pages.json")["pages"]
    available_pages = {record["page"] for record in building["records"]} | {
        page for page, entry in related.items() if not entry.get("missing")}

    def asset_path(url: str | None) -> str | None:
        return assets.get(url or "", {}).get("path")

    ready = []
    unresolved_marker_links = []
    for record in building["records"]:
        detail = record["detail"]
        name = record["page"]
        listed_recipe = record["recipe"]
        detail_recipe = detail["recipe"]
        # The raw Mycelium page uses an unsupported template field (Quantity).
        # Both rendered wiki surfaces show one product, so prefer the rendered list.
        recipe = listed_recipe if name == "Mycelium (Overgrowth Material)" else detail_recipe or listed_recipe
        # Climbing Rose's individual page was updated after its overview table.
        recipe_review = "detail-page-preferred" if name == "Climbing Rose" else (
            "rendered-page-preferred" if name == "Mycelium (Overgrowth Material)" else None)
        if recipe["status"] == "listed":
            recipe = {**recipe, "ingredients": [
                {**item, "page": item.get("page") or (item["name"] if item["name"] in available_pages else None)}
                for item in recipe["ingredients"]
            ]}
        icon = images.get(record["imageFile"] or "", {})
        appearance = images.get(detail["appearanceImageFile"] or "", {})
        availability_links = []
        for link in record["availability"]["links"]:
            target = {**link, "pageAvailable": link["page"] in available_pages}
            if link.get("markerId"):
                target["markerAvailable"] = link["markerId"] in map_ids
                if not target["markerAvailable"]:
                    unresolved_marker_links.append({"item": name, "markerId": link["markerId"],
                        "label": link["label"]})
            availability_links.append(target)
        ready.append({
            "id": name.replace(" ", "_"), "name": record["name"],
            "sourceCatalog": record["sourceCatalog"], "group": record["group"], "set": record["set"],
            "type": detail["type"], "rarity": detail["rarity"], "stackSize": detail["stackSize"],
            "level": detail["level"], "biomes": detail["biomes"],
            "description": detail["description"], "obtainingText": detail["obtainingText"],
            "availability": {"text": record["availability"]["text"], "links": availability_links},
            "recipe": recipe, "recipeReview": recipe_review,
            "icon": {"file": record["imageFile"], "path": asset_path(icon.get("url")),
                "width": icon.get("width"), "height": icon.get("height")},
            "appearance": {"file": detail["appearanceImageFile"], "path": asset_path(appearance.get("url")),
                "width": appearance.get("width"), "height": appearance.get("height")}
                if detail["appearanceImageFile"] else None,
            "sourcePage": name, "sourceRevision": detail["revision"],
        })
    write("building-catalog-ready.json", {"schemaVersion": 1, "recordCount": len(ready),
        "catalogs": building["catalogs"], "records": ready})
    write("unresolved-map-links.json", unresolved_marker_links)

    config = read("map-config.json")
    sources = read("asset-sources.json")
    groups = {}
    for item in config["maps"]:
        for key, value in item["config"]["groups"].items():
            icon_url = urljoin(BASE, value["markerIcon"]) if value.get("markerIcon") else None
            groups[key] = {"name": value.get("name"), "icon": asset_path(icon_url),
                "size": value.get("size")}
    tiles = [{"name": tile["name"], "bounds": tile["bounds"],
        "path": asset_path(tile["url"])} for tile in sources["tiles"]]
    normalized_markers = []
    for marker in map_markers:
        group = next((value for value in marker["layers"].split() if value in groups), None)
        normalized_markers.append({
            "id": marker["id"], "x": marker["x"], "y": marker["y"], "layers": marker["layers"],
            "group": group, "name": marker["name"], "description": marker["description"],
            "descriptionHtml": marker["descriptionHtml"], "article": marker["article"],
            "panelImage": asset_path(marker["panelImage"]["url"]) if marker["panelImage"] else None,
            "presentOn": marker["presentOn"], "sourceFragment": marker["sourceFragment"],
        })
    write("map-catalog-ready.json", {"schemaVersion": 1,
        "coordinateSystem": {"topLeft": [0, 10240], "bottomRight": [10240, 0]},
        "tileSize": [1280, 1280], "tiles": tiles, "groups": groups,
        "markerCount": len(normalized_markers), "markers": normalized_markers})
    if len(ready) != 123 or len(normalized_markers) != 1018 or len(tiles) != 64:
        raise RuntimeError("Unexpected catalog size")
    if any(not tile["path"] for tile in tiles):
        raise RuntimeError("Map tile is missing its local asset")
    if any(not record["icon"]["path"] for record in ready):
        raise RuntimeError("Building item icon is missing its local asset")
    if any(marker["group"] is None for marker in normalized_markers):
        raise RuntimeError("Map marker has no known group")
    print(f"Ready: {len(ready)} building entries, {len(normalized_markers)} markers, {len(tiles)} tiles")
    print(f"Unresolved listed map links: {len(unresolved_marker_links)}")


if __name__ == "__main__":
    main()
