"""Audit source-backed links between Enshrouded map markers and local catalogs.

This reads the bundled snapshots only. It does not infer live game spawns or
turn a shared place name into an item-location claim.
"""

import json
import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data/enshrouded"
MAP = ROOT / "public/maps/enshrouded/metadata.json"
SOURCE = ROOT / "research/enshrouded-wiki/map-catalog-ready.json"
OUTPUT = ROOT / "research/enshrouded-wiki/map-db-audit.json"
SOURCE_LINKS = DATA / "marker-source-links.json"
ACQUISITION_MAP_LINKS = DATA / "wiki-obtaining-map-links.json"
ITEM_PAGES = ROOT / "research/enshrouded-wiki/next-catalogs/item-pages.json"


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(page: str):
    return unquote(page).replace("_", " ").strip().casefold()


def source_relation(description: str, page: str):
    """Only call an item found when the marker's own sentence says so."""
    match = re.search(re.escape(page), description, re.IGNORECASE)
    if not match:
        return "related"
    clause = description[:match.start()].rsplit(".", 1)[-1]
    return "found" if re.search(
        r"\b(?:grows?|contains?|found in|found at|loots?|harvests?|mines?)\b",
        clause, re.IGNORECASE) else "related"


class WikiAnchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pages = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        if "/wiki/" in href and "redlink=1" not in href:
            self.pages.append(unquote(href.split("/wiki/")[-1].split("?")[0]).replace("_", " "))


def catalog_pages():
    wiki = {normalize(page) for page in read(DATA / "wiki-page-index.json")}
    building = {normalize(page) for page in read(DATA / "building-page-index.json")}
    crafting_index = read(DATA / "crafting-page-index.json")
    crafting = {normalize(page) for group in crafting_index.values() for page in group}
    progression_index = read(DATA / "progression-page-index.json")
    progression = {normalize(entry[key]) for group in progression_index.values()
                   for entry in group for key in ("id", "name") if key in entry}
    return {"wiki": wiki, "building": building, "crafting": crafting,
            "progression": progression}


def marker_id_values(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "markerId" and isinstance(child, str):
                yield child
            else:
                yield from marker_id_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from marker_id_values(child)


def marker_links(value):
    if isinstance(value, dict):
        if isinstance(value.get("markerId"), str):
            yield value
        for child in value.values():
            yield from marker_links(child)
    elif isinstance(value, list):
        for child in value:
            yield from marker_links(child)


def acquisition_marker_ids(source):
    """Only link markers named in the item's own acquisition paragraph."""
    section = re.search(r"^==\s*(?:Obtaining|Source|Sources|Dropped From)\s*==\s*(.*?)(?=^==[^=]|\Z)",
                        source or "", re.IGNORECASE | re.MULTILINE | re.DOTALL)
    if section:
        paragraph = re.split(r"\n\s*\n|^===", section.group(1), maxsplit=1, flags=re.MULTILINE)[0]
    else:
        position = 0
        if (source or "").startswith("{{"):
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
        lead = re.split(r"^==[^=]", (source or "")[position:], maxsplit=1, flags=re.MULTILINE)[0]
        paragraph = next((sentence for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z{])", lead)
                          if re.search(r"\b(?:can be|is|are)\s+(?:found|obtained|looted|dropped)\b",
                                       sentence, re.IGNORECASE)), "")
    links = []
    for match in re.finditer(r"\{\{\s*MapLink\s*\|([^{}]+)\}\}", paragraph, re.IGNORECASE):
        values = [part.strip() for part in match.group(1).split("|") if "=" not in part]
        before = paragraph[:match.start()].strip()
        nearby = re.search(r"\b(?:near|outside of|(?:north|south|east|west)(?:-?(?:east|west))? of)\s*(?:the\s*)?$",
                           before, re.IGNORECASE)
        if values and values[0] not in [marker_id for marker_id, _ in links]:
            links.append((values[0], "related" if nearby else "found"))
    return links


def main():
    map_points = read(MAP)["locations"]
    map_by_id = {point["id"]: point for point in map_points}
    source_points = read(SOURCE)["markers"]
    assert len(map_by_id) == len(map_points)
    corrections = read(DATA / "map-source-corrections.json")
    native_points = corrections["additionalMarkers"]
    assert {point["id"] for point in source_points + native_points} == map_by_id.keys()
    by_name = defaultdict(list)
    for point in map_points:
        by_name[normalize(point["name"])].append(point)

    wiki_records = read(DATA / "wiki-catalog.json")["records"]
    wiki_map_links = read(DATA / "wiki-map-links.json")
    collectible_matches = []
    for record in wiki_records:
        if record["catalog"] != "collectibles":
            continue
        explicit_ids = wiki_map_links.get(record["id"], [])
        same_name = [point["id"] for point in by_name[normalize(record["name"])]
                     if point["wikiArticle"].startswith("Collectibles#")]
        marker_ids = explicit_ids or same_name
        collectible_matches.append({
            "record": record["id"], "section": record["section"],
            "markerIds": marker_ids,
            "evidence": "explicit validated map links" if explicit_ids else
                        "exact marker name and Collectibles article" if same_name else "none",
            "databaseToMapLinked": bool(explicit_ids),
        })
    assert all(marker_id in map_by_id for row in collectible_matches
               for marker_id in row["markerIds"])

    building_records = read(DATA / "building-catalog.json")["records"]
    building_availability = []
    for record in building_records:
        for link in (record.get("availability") or {}).get("links", []):
            if link.get("markerId"):
                building_availability.append({
                    "record": record["sourcePage"], "markerId": link["markerId"],
                    "markerExists": link["markerId"] in map_by_id,
                })

    pages = catalog_pages()
    source_anchors = []
    all_source_anchor_count = 0
    for point in source_points:
        parser = WikiAnchors()
        parser.feed(point.get("descriptionHtml") or "")
        for page in parser.pages:
            all_source_anchor_count += 1
            catalogs = [catalog for catalog, known in pages.items()
                        if normalize(page) in known]
            if catalogs:
                source_anchors.append({"markerId": point["id"], "page": page,
                                       "catalogs": catalogs,
                                       "relation": source_relation(point.get("description") or "", page)})
    for point in native_points:
        for link in point.get("relatedPages", []):
            catalogs = [catalog for catalog, known in pages.items() if normalize(link["page"]) in known]
            if catalogs:
                source_anchors.append({"markerId": point["id"], "page": link["page"],
                                       "catalogs": catalogs, "relation": "found"})
    assert len({(row["markerId"], row["page"]) for row in source_anchors}) == len(source_anchors)

    related_pages = [{"markerId": point["id"], **link}
                     for point in map_points for link in point.get("relatedPages", [])]
    item_pages = read(ITEM_PAGES)
    acquisition_links = []
    for record in wiki_records:
        source = item_pages.get(record["id"], {}).get("sourceWikitext")
        for marker_id, relation in acquisition_marker_ids(source):
            if marker_id in map_by_id:
                acquisition_links.append({"markerId": marker_id, "page": record["id"],
                                          "catalogs": ["wiki"], "relation": relation})
    # The Elixir article names Scavenger camps generically; these markers are
    # possible sources, not guaranteed drops at each camp.
    elixir_camps = [point for point in map_points if point["category"] == "wiki-enemy_camp"
                    and "Scavenger" in point["name"]
                    and "Camp inhabited by Scavengers" in (point.get("description") or "")]
    acquisition_links.extend({"markerId": point["id"], "page": "Elixir", "catalogs": ["wiki"],
                              "relation": "possible"} for point in elixir_camps)
    acquisition_map_index = defaultdict(list)
    for link in acquisition_links:
        if link["markerId"] not in acquisition_map_index[link["page"]]:
            acquisition_map_index[link["page"]].append(link["markerId"])
    ACQUISITION_MAP_LINKS.write_text(json.dumps(dict(sorted(acquisition_map_index.items())),
                                                ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    source_link_index = defaultdict(dict)
    for link in [*source_anchors, *related_pages, *acquisition_links]:
        marker_id = link["markerId"]
        page_key = normalize(link["page"])
        catalogs = link.get("catalogs", ["building"])
        entry = source_link_index[marker_id].setdefault(
            page_key, {"page": link["page"], "catalogs": [], "relation": "related"})
        entry["catalogs"].extend(catalog for catalog in catalogs
                                 if catalog not in entry["catalogs"])
        if link.get("relation", "found") == "found":
            entry["relation"] = "found"
        elif link.get("relation") == "possible" and entry["relation"] != "found":
            entry["relation"] = "possible"
    published_links = {marker_id: list(entries.values())
                       for marker_id, entries in sorted(source_link_index.items())}
    SOURCE_LINKS.write_text(json.dumps(published_links, ensure_ascii=False,
                                       indent=2) + "\n", encoding="utf-8")
    material_locations = read(DATA / "material-locations.json")
    truncated_lists = [{"page": page, "total": len(locations),
                        "visible": 12, "hiddenMarkerIds": [item["id"] for item in locations[12:]]}
                       for page, locations in material_locations.items() if len(locations) > 12]
    assert all(item["id"] in map_by_id for locations in material_locations.values()
               for item in locations)

    progression_catalog = read(DATA / "progression-catalog.json")
    crafting_catalog = read(DATA / "crafting-catalog.json")
    progression_ids = list(marker_id_values(progression_catalog))
    progression_marker_records = []
    for group, records in progression_catalog.items():
        if not isinstance(records, list):
            continue
        for record in records:
            links = list(marker_links(record))
            for marker_id in sorted({link["markerId"] for link in links}):
                progression_marker_records.append({"group": group, "record": record["id"],
                                                   "markerId": marker_id,
                                                   "markerExists": marker_id in map_by_id})

    npc_locations = []
    for npc in progression_catalog["npcs"]:
        location_ids = sorted({link["markerId"] for fact in npc.get("facts", [])
                               if fact.get("name") == "Location"
                               for link in fact.get("links", []) if link.get("markerId")})
        unlock_quests = sorted({link["page"] for fact in npc.get("facts", [])
                                if fact.get("name") == "Unlock Quest"
                                for link in fact.get("links", [])
                                if link.get("page", "").startswith("Quests/")})
        grouped_quests = sorted(quest["id"] for quest in progression_catalog["quests"]
                                if quest.get("group") == npc["name"] + " Quests")
        direct_recipes = [recipe for recipe in crafting_catalog["recipes"]
                          if npc["role"] in recipe["stations"]]
        for marker_id in location_ids:
            point = map_by_id.get(marker_id)
            npc_locations.append({
                "npc": npc["id"], "name": npc["name"], "role": npc["role"],
                "markerId": marker_id, "markerName": point["name"] if point else None,
                "markerExists": point is not None,
                "markerWikiArticle": point.get("wikiArticle") if point else None,
                "unlockQuests": unlock_quests, "groupedQuests": grouped_quests,
                "directRecipeCount": len(direct_recipes),
                "directRecipeIds": [recipe["id"] for recipe in direct_recipes],
                "directRecipeOutputs": sorted({recipe["output"]["name"] for recipe in direct_recipes}),
            })

    wiki_marker_relations = [{"record": record["id"], "catalog": record["catalog"],
                              "markerId": related, "markerName": map_by_id[related]["name"]}
                             for record in wiki_records for related in record.get("related", [])
                             if related in map_by_id
                             and not any(normalize(related) in known for known in pages.values())]
    asset_checks = {}
    for field in ("iconPath", "artworkPath"):
        paths = [point[field] for point in map_points if point.get(field)]
        asset_checks[field] = {"references": len(paths),
                               "missing": sorted({path for path in paths
                                                  if not (ROOT / "public" / path).is_file()})}

    linked_collectibles = [row for row in collectible_matches if row["databaseToMapLinked"]]
    missing_collectible_links = [row for row in collectible_matches
                                 if row["markerIds"] and not row["databaseToMapLinked"]]
    matched_collectibles = [row for row in collectible_matches if row["markerIds"]]
    report = {
        "scope": "Bundled Enshrouded map and catalog snapshots; static code/data audit",
        "sourceFiles": [str(path.relative_to(ROOT)).replace("\\", "/") for path in
                        (MAP, SOURCE, DATA / "wiki-catalog.json", DATA / "building-catalog.json",
                         DATA / "material-locations.json", DATA / "progression-catalog.json",
                         DATA / "crafting-catalog.json")],
        "summary": {
            "mapMarkers": len(map_points),
            "markersWithDescriptions": sum(bool(point.get("description")) for point in map_points),
            "markersWithPanelArtwork": sum(bool(point.get("artworkPath")) for point in map_points),
            "markersWithReference": sum(bool(point.get("reference")) for point in map_points),
            "markersWithItemId": sum(bool(point.get("itemId")) for point in map_points),
            "collectibleRecords": len(collectible_matches),
            "collectibleRecordsWithVerifiedMarkers": len(matched_collectibles),
            "collectibleMarkersWithCatalogRecords": sum(len(row["markerIds"]) for row in matched_collectibles),
            "collectibleRecordsAlreadyLinkedFromDatabase": len(linked_collectibles),
            "collectibleRecordsMissingDatabaseToMapLink": len(missing_collectible_links),
            "buildingAvailabilityLinks": len(building_availability),
            "buildingAvailabilityLinksWithExistingMarker": sum(row["markerExists"] for row in building_availability),
            "buildingAvailabilityLinksWithMissingMarker": sum(not row["markerExists"] for row in building_availability),
            "sourceDescriptionAnchors": all_source_anchor_count,
            "sourceAnchorsResolvingToLocalCatalogs": len(source_anchors),
            "markersWithResolvableSourceAnchors": len({row["markerId"] for row in source_anchors}),
            "publishedRelatedPageLinks": len(related_pages),
            "markersWithPublishedRelatedPages": len({row["markerId"] for row in related_pages}),
            "publishedUniqueMarkerCatalogLinks": sum(len(links) for links in published_links.values()),
            "markersWithPublishedCatalogLinks": len(published_links),
            "materialLocationLinks": sum(len(locations) for locations in material_locations.values()),
            "materialLocationLinksAfterInitialTwelve": sum(len(row["hiddenMarkerIds"]) for row in truncated_lists),
            "progressionMarkerLinks": len(progression_ids),
            "invalidProgressionMarkerLinks": sorted(set(progression_ids) - map_by_id.keys()),
            "progressionRecordsWithMarkerLinks": len({(row["group"], row["record"])
                                                       for row in progression_marker_records}),
            "markersReferencedByProgressionRecords": len({row["markerId"]
                                                             for row in progression_marker_records}),
            "npcLocationLinks": len(npc_locations),
            "npcLocationLinksWithExistingMarker": sum(row["markerExists"] for row in npc_locations),
            "invalidNpcLocationLinks": sorted({row["markerId"] for row in npc_locations
                                               if not row["markerExists"]}),
            "npcLocationsWithUnlockQuest": sum(bool(row["unlockQuests"]) for row in npc_locations),
            "npcLocationsWithGroupedQuests": sum(bool(row["groupedQuests"]) for row in npc_locations),
            "npcLocationsWithDirectRecipes": sum(bool(row["directRecipeCount"]) for row in npc_locations),
            "wikiRelatedMarkerLinks": len(wiki_marker_relations),
            "wikiRecordsWithRelatedMarkerLinks": len({row["record"] for row in wiki_marker_relations}),
        },
        "collectibleMatches": collectible_matches,
        "buildingAvailability": building_availability,
        "sourceDescriptionCatalogAnchors": source_anchors,
        "publishedRelatedPages": related_pages,
        "truncatedMaterialLocationLists": truncated_lists,
        "mapAssetChecks": asset_checks,
        "progressionMarkerRecords": progression_marker_records,
        "npcLocations": npc_locations,
        "wikiRelatedMarkerLinks": wiki_marker_relations,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Detailed report: {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
