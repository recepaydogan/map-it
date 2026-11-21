"""Publish quest visibility and direct quest objectives for citizen markers."""

import argparse
import json
from collections import defaultdict
from pathlib import Path


def rows(directory, table):
    return json.loads((directory / f"{table}.json").read_text("utf-8"))["Properties"]["Data"]


def cell_id(cell):
    return cell["Value"] if isinstance(cell, dict) else cell


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--localization", type=Path, required=True)
    parser.add_argument("--maps", type=Path, default=Path("public/maps"))
    parser.add_argument("--output", type=Path, default=Path("public/data/citizen-availability.json"))
    args = parser.parse_args()

    strings = json.loads(args.localization.read_text("utf-8"))["Entries"]
    quest_strings = {row["Name"]: row for row in rows(args.tables, "QuestString")}
    quests = {row["Name"]: row for row in rows(args.tables, "Quest")}
    quest_titles = {}
    for name, quest in quests.items():
        title_key = quest_strings.get(quest["QuestText"], {}).get("Title", {}).get("Key")
        quest_titles[name] = strings.get(title_key) if title_key else None

    citizens = {row["Name"]: str(cell_id(row["ID"])) for row in rows(args.tables, "NpcData")
                if row["NpcType"] == "ENpcType::Citizen"}
    env_ids = {row["Name"]: str(cell_id(row["ID"])) for row in rows(args.tables, "EnvObjData")}
    quest_steps = defaultdict(lambda: defaultdict(list))
    for row in rows(args.tables, "QuestStep"):
        quest_steps[row["QuestName"]][cell_id(row["ID"]) % 100].append(row)

    maps = defaultdict(list)
    for path in sorted(args.maps.glob("*/metadata.json")):
        metadata = json.loads(path.read_text("utf-8"))
        projection = metadata.get("worldProjection")
        if projection:
            maps[projection["mapId"]].append((path.parent.name, metadata["locations"]))

    def boundary(raw):
        kind = raw["ShowType"].split("::")[-1]
        quest_name = raw["Value1"]
        title = quest_titles.get(quest_name)
        if kind == "None" or not title:
            return None
        result = {"kind": kind, "quest": title, "questId": str(cell_id(quests[quest_name]["ID"]))}
        raw_step = raw["Value2"]
        if raw_step.isdigit() and int(raw_step) in quest_steps[quest_name]:
            result["step"] = int(raw_step)
        return result

    records = defaultdict(lambda: {"windows": [], "talk": []})
    for row in rows(args.tables, "PeriodObjectVisibility"):
        npc_id = citizens.get(row["ObjectName"]) if row["ObjectType"] == "EObjectType::Npc" else None
        if not npc_id:
            continue
        start, end = boundary(row["ShowStart"]), boundary(row["ShowEnd"])
        if start or end:
            window = {"start": start, "end": end}
            if window not in records[npc_id]["windows"]:
                records[npc_id]["windows"].append(window)

    for quest_name, steps in quest_steps.items():
        title = quest_titles.get(quest_name)
        if not title:
            continue
        quest_id = str(cell_id(quests[quest_name]["ID"]))
        for step_number, variants in steps.items():
            for step in variants:
                for goal in step["GoalList"]:
                    values = goal.get("Value", [])
                    npc_id = citizens.get(values[0]) if values and goal["Type"] == "EQuestObjectiveType::AskNpc" else None
                    if not npc_id:
                        continue
                    action = {"quest": title, "questId": quest_id, "step": step_number}
                    next_steps = steps.get(step_number + 1, [])
                    next_goals = [next_goal for next_step in next_steps for next_goal in next_step["GoalList"]
                                  if next_goal["Type"] == "EQuestObjectiveType::UseEnvObj"]
                    if len(next_goals) == 1:
                        next_goal = next_goals[0]
                        next_actor = next_goal.get("Value", [None])[0]
                        env_id = env_ids.get(next_actor)
                        world_id = cell_id(next_goal["MapId"])
                        candidates = [(slug, marker) for slug, locations in maps.get(world_id, [])
                                      if any(point.get("entityId") == npc_id for point in locations)
                                      for marker in locations if marker.get("entityId") == env_id and not marker.get("hiddenFromMap")]
                        if len(candidates) == 1:
                            slug, marker = candidates[0]
                            action["next"] = {"name": marker["name"], "mapId": slug, "markerId": marker["id"]}
                    if action not in records[npc_id]["talk"]:
                        records[npc_id]["talk"].append(action)

    published = {npc_id: {"windows": sorted(data["windows"], key=lambda item: json.dumps(item, sort_keys=True)),
                          "talk": sorted(data["talk"], key=lambda item: (item["quest"], item["step"]))}
                 for npc_id, data in sorted(records.items())}
    result = {"version": 2, "npcs": published}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Published visibility and quest objectives for {len(published)} citizens to {args.output}")


if __name__ == "__main__":
    main()
