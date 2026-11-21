"""Add source-linked HP actions to existing creature boss panel data."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def objective_actions(objective):
    summons = []
    starts_wave = False
    for directive in objective["objectivePostDirectives"]:
        if directive["type"] == "SummonAroundTarget":
            values = directive["values"]
            if len(values) < 5 or not str(values[4]).isdigit() or int(values[4]) <= 0:
                raise ValueError(f"Invalid summon directive: {values}")
            summons.append((values[3], int(values[4])))
        elif directive["type"] == "StartWave":
            starts_wave = True
    return tuple(sorted(summons)), starts_wave


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--panel-data", type=Path, required=True)
    args = parser.parse_args()

    cases = {case["id"]: case for case in
             (json.loads(line) for line in args.cases.read_text(encoding="utf8").splitlines())}
    panel = json.loads(args.panel_data.read_text(encoding="utf8"))
    counts = defaultdict(int)
    for reference_id, entry in panel["entries"].items():
        entry.pop("scriptedHpActions", None)
        if not entry.get("scriptedHpPercent"):
            continue
        npc_id = int(reference_id.split(":", 1)[1])
        case = cases.get(npc_id)
        if case is None:
            raise ValueError(f"Missing encounter case: {reference_id}")
        by_percent = defaultdict(list)
        for objective in case["eventObjectives"]:
            if objective["type"] == "HpRemaining":
                by_percent[int(objective["values"][0])].append(objective_actions(objective))

        actions = []
        for percent in entry["scriptedHpPercent"]:
            variants = set(by_percent[percent])
            if len(variants) != 1:
                counts["ambiguous"] += 1
                continue
            summons, starts_wave = next(iter(variants))
            action = {"percent": percent}
            if summons:
                action["summons"] = [{"id": name, "count": count} for name, count in summons]
                counts["summons"] += 1
            if starts_wave:
                action["startsWave"] = True
                counts["waves"] += 1
            if len(action) > 1:
                actions.append(action)
        if actions:
            entry["scriptedHpActions"] = actions
            counts["bosses"] += 1

    panel["sources"]["casesSha256"] = hashlib.sha256(args.cases.read_bytes()).hexdigest()
    args.panel_data.write_text(json.dumps(panel, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(json.dumps(dict(counts), indent=2))


if __name__ == "__main__":
    main()
