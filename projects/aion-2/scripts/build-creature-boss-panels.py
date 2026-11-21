"""Publish concise, source-linked encounter facts for curated creature panels."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def rows(path):
    return json.loads(path.read_text(encoding="utf8"))["Properties"]["Data"]


def value(cell):
    return cell["Value"] if isinstance(cell, dict) else cell


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--npc-table", type=Path, required=True)
    parser.add_argument("--skill-table", type=Path, required=True)
    parser.add_argument("--icons-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    npcs = {value(row["ID"]): row for row in rows(args.npc_table)}
    skills = {value(row["ID"]): row for row in rows(args.skill_table)}
    entries = {}
    skipped_mixed_hp = []
    for line in args.evidence.read_text(encoding="utf8").splitlines():
        evidence = json.loads(line)
        npc_id = evidence["npcId"]
        npc = npcs[npc_id]
        entry = {}

        icon_keys = {skills[value(skill)]["SkillIcon"] for skill in npc.get("ActiveSkillList", [])
                     if value(skill) in skills and skills[value(skill)].get("SkillIcon") not in ("", "None")}
        if len(icon_keys) == 1:
            key = next(iter(icon_keys))
            filename = key.split("/")[-1].lower().replace("_", "-") + ".png"
            if (args.icons_dir / filename).is_file():
                entry["skillIcon"] = f"icons/skills/{filename}"

        hp_by_event = defaultdict(set)
        for objective in evidence["hpEventObjectives"]:
            percent = objective["hpPercent"]
            if not isinstance(percent, int) or not 0 < percent < 100:
                raise ValueError(f"Invalid HP objective for NPC {npc_id}: {percent}")
            hp_by_event[(objective["mapId"], objective["event"])].add(percent)
        hp_sets = {tuple(sorted(thresholds, reverse=True)) for thresholds in hp_by_event.values()}
        if len(hp_sets) == 1:
            entry["scriptedHpPercent"] = list(next(iter(hp_sets)))
        elif hp_sets:
            skipped_mixed_hp.append(npc_id)

        roles = {role["role"] for role in evidence["rewardCubeRoles"]}
        if len(roles) == 1 and next(iter(roles)) in ("middle", "final"):
            entry["dungeonRole"] = next(iter(roles))

        events = {(event["title"], event["description"]) for event in evidence["fieldEvents"]
                  if event.get("title") and event.get("description")}
        if len(events) == 1:
            title, description = next(iter(events))
            entry["fieldEvent"] = {"title": title, "description": description}

        if entry:
            entries[f"NpcData:{npc_id}"] = entry

    output = {
        "version": 1,
        "sources": {
            "evidenceSha256": sha256(args.evidence),
            "npcTableSha256": sha256(args.npc_table),
            "skillTableSha256": sha256(args.skill_table),
        },
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(json.dumps({"entries": len(entries), "icons": sum("skillIcon" in entry for entry in entries.values()),
                      "hp": sum("scriptedHpPercent" in entry for entry in entries.values()),
                      "roles": sum("dungeonRole" in entry for entry in entries.values()),
                      "events": sum("fieldEvent" in entry for entry in entries.values()),
                      "mixedHpDeferred": skipped_mixed_hp}, indent=2))


if __name__ == "__main__":
    main()
