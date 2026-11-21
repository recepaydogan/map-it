"""Publish map event entrances joined to their exact event, map, and schedule."""

import argparse
import json
from math import hypot
from pathlib import Path


def rows(directory: Path, table: str):
    return json.loads((directory / f"{table}.json").read_text(encoding="utf-8"))["Properties"]["Data"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--maps", type=Path, default=Path("public/maps"))
    parser.add_argument("--reference-index", type=Path, default=Path("public/data/reference/index.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/event-entrances.json"))
    args = parser.parse_args()

    markers = []
    marker_bosses = {}
    marker_map_ids = {}
    event_areas = {}
    for path in args.maps.glob("*/metadata.json"):
        metadata = json.loads(path.read_text(encoding="utf-8"))
        locations = metadata["locations"]
        for region in metadata.get("regions", []):
            if region["id"].startswith("event-layer-"):
                map_id = int(region["id"].removeprefix("event-layer-"))
                event_areas[map_id] = {"mapId": path.parent.name, "regionId": region["id"],
                                       "nameKey": f"mapInteriors.names.{map_id}"}
        entrances = [point for point in locations if point.get("category") == "event-entrance"
                     and not point.get("eventLayerMapId") and not point.get("insetId")]
        creatures = [point for point in locations if point.get("category") in ("boss", "dungeon-boss", "enemy")
                     and point.get("reference", {}).get("category") == "creatures"]
        markers.extend(entrances)
        for entrance in entrances:
            marker_map_ids[entrance["id"]] = path.parent.name
            nearest = {}
            for creature in creatures:
                distance = hypot(entrance["x"] - creature["x"], entrance["y"] - creature["y"])
                if distance > 120:
                    continue
                creature_id = creature["reference"]["id"]
                if creature_id not in nearest or distance < nearest[creature_id][0]:
                    nearest[creature_id] = (distance, creature["id"])
            if nearest:
                marker_bosses[entrance["id"]] = {creature_id: value[1] for creature_id, value in sorted(nearest.items())}
    if not markers:
        raise ValueError("No event entrance markers found")

    npcs = {str(row["ID"]["Value"]): row for row in rows(args.tables, "NpcData")}
    events = {row["EventName"]: row for row in rows(args.tables, "FieldEvent")}
    maps = {row["ID"]["Value"]: row for row in rows(args.tables, "Map")}
    schedules = {}
    for row in rows(args.tables, "EventSchedule"):
        for event in row["EventList"]:
            if event["Category"] == "EEventCategoryType::FieldEvent":
                schedules.setdefault(event["Key"], []).append(row)
    reference_index = {entry["id"]: entry for entry in json.loads(args.reference_index.read_text(encoding="utf-8"))["entries"]}

    marker_ids = set()
    for marker in markers:
        npc_id = marker["entityId"]
        if marker.get("reference", {}).get("id") != f"NpcData:{npc_id}":
            raise ValueError(f"Invalid marker reference: {marker['id']}")
        marker_ids.add(npc_id)
    entrances = {}
    for npc_id, npc in npcs.items():
        if npc["FunctionType"] != "ENpcFuncType::EnterFieldEvent":
            continue
        event = events[npc["FuncValues"][0]]
        schedule_matches = schedules.get(event["EventGroup"], [])
        if len(schedule_matches) != 1:
            raise ValueError(f"Expected one schedule for {npc_id}, found {len(schedule_matches)}")
        schedule = schedule_matches[0]
        map_id = event["MapId"]["Value"]
        if map_id not in maps:
            raise ValueError(f"Missing destination map {map_id} for {npc_id}")
        event_id = f"FieldEvent:{event['ID']['Value']}"
        destination_id = f"Dungeon:{map_id}" if f"Dungeon:{map_id}" in reference_index else None
        schedule_id = f"EventSchedule:{schedule['ID']['Value']}"
        if event_id not in reference_index or schedule_id not in reference_index:
            raise ValueError(f"Missing event or schedule reference for {npc_id}")
        detail = {
            "eventId": event_id,
            "mapId": map_id,
            "autoCombatAllowed": maps[map_id]["bCanAutoBattle"],
            "destinationId": destination_id,
            "scheduleId": schedule_id,
            "days": [index for index, day in enumerate(("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"))
                     if schedule[f"b{day}"]],
            "starts": [f"{ticks // 36000000000:02d}:{ticks % 36000000000 // 600000000:02d}"
                       for ticks in sorted(time["Ticks"] for time in schedule["ActiveTimeList"])],
        }
        if map_id in event_areas:
            detail["eventArea"] = event_areas[map_id]
        entrances[npc_id] = detail

    if not marker_ids <= entrances.keys():
        raise ValueError(f"Unresolved map entrance NPCs: {sorted(marker_ids - entrances.keys())}")

    dungeon_cache = {}
    def dungeon_entry(destination_id):
        if destination_id not in dungeon_cache:
            summary = reference_index[destination_id]
            path = args.reference_index.parent / summary["category"] / f"{summary['chunk']}.json"
            dungeon_cache[destination_id] = json.loads(path.read_text(encoding="utf-8"))["entries"][destination_id]
        return dungeon_cache[destination_id]

    image_by_family = {}
    for entrance in entrances.values():
        destination_id = entrance["destinationId"]
        if not destination_id:
            continue
        targets = dungeon_entry(destination_id).get("interiorMaps")
        if not targets:
            continue
        activity = reference_index[entrance["eventId"]]["activity"]
        key = (activity["familyId"], activity["faction"])
        image_by_family.setdefault(key, {})[entrance["mapId"]] = targets
    for entrance in entrances.values():
        if entrance["destinationId"] or not entrance.get("eventArea"):
            continue
        activity = reference_index[entrance["eventId"]]["activity"]
        matches = image_by_family.get((activity["familyId"], activity["faction"]), {})
        if len(matches) != 1:
            raise ValueError(f"Expected one related dungeon image for {entrance['eventId']}")
        entrance["relatedInteriorMaps"] = next(iter(matches.values()))

    dungeon_bosses = {}
    for destination_id in {entrance["destinationId"] for entrance in entrances.values()} - {None}:
        dungeon = dungeon_entry(destination_id)
        dungeon_bosses[destination_id] = {link["id"] for section in dungeon["sections"]
                                          if section["title"] in ("reference.labels.bosses", "reference.labels.boss")
                                          for link in section.get("links", [])}
    marker_bosses = {marker["id"]: {"npcId": marker["entityId"], "mapId": marker_map_ids[marker["id"]], "bosses": matched}
                     for marker in markers
                     if (matched := {boss_id: marker_id for boss_id, marker_id in marker_bosses.get(marker["id"], {}).items()
                                     if boss_id in dungeon_bosses.get(entrances[marker["entityId"]]["destinationId"], set())})}

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"version": 1, "npcs": dict(sorted(entrances.items())),
                                       "bossMarkers": dict(sorted(marker_bosses.items()))},
                                      ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Published {len(entrances)} event entrances from {len(markers)} markers to {args.output}")


if __name__ == "__main__":
    main()
