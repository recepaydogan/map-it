"""Derive missing zhCN quest prose from reviewed zhTW text and client names.

Requires opencc-python-reimplemented==0.1.7 as a build-only tool.
"""

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from opencc import OpenCC


ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "public/data/locales/wow-forever"
REVIEWED = ROOT / "data/quest-text-localization/reviewed-prose.json"
OUTPUT = ROOT / "data/quest-text-localization/zh-cn-derived.json"


def load(path):
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def token_in_text(token, text):
    return bool(re.search(r"(?<![A-Za-z])" + re.escape(token) + r"(?![A-Za-z])", text))


def name_pairs(converter):
    candidates = defaultdict(Counter)
    for prefix in ("", "map-entity-"):
        source, _ = load(LOCALES / (prefix + "source.json"))
        simplified, _ = load(LOCALES / (prefix + "zhCN.json"))
        traditional, _ = load(LOCALES / (prefix + "zhTW.json"))
        for english, cn, tw in zip(
            source["values"], simplified["values"], traditional["values"]
        ):
            if not cn or not tw or not isinstance(english, str) or len(english) < 3:
                continue
            converted = converter.convert(tw)
            if len(converted) >= 2 and converted != cn:
                candidates[(english, converted)][cn] += 1
    return [
        (english, converted, next(iter(counts)))
        for (english, converted), counts in candidates.items()
        if len(counts) == 1 and sum(counts.values()) >= (5 if len(converted) == 2 else 2)
    ]


def adjust_names(english, converted, pairs):
    applicable = defaultdict(set)
    for name, old, new in pairs:
        if old in converted and token_in_text(name, english):
            applicable[old].add(new)
    replacements = {
        old: next(iter(values))
        for old, values in applicable.items()
        if len(values) == 1
    }
    if not replacements:
        return converted, 0
    pattern = re.compile("|".join(re.escape(old) for old in sorted(
        replacements, key=len, reverse=True)))
    count = 0

    def replace(match):
        nonlocal count
        count += 1
        return replacements[match.group()]

    return pattern.sub(replace, converted), count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    converter = OpenCC("tw2s")
    source, source_hash = load(LOCALES / "quest-text-source.json")
    simplified, cn_hash = load(LOCALES / "quest-text-zhCN.json")
    traditional, tw_hash = load(LOCALES / "quest-text-zhTW.json")
    reviewed, reviewed_hash = load(REVIEWED)
    if not (len(source["keys"]) == len(source["values"]) ==
            len(simplified["values"]) == len(traditional["values"])):
        raise ValueError("Quest text packs have different lengths")
    pairs = name_pairs(converter)
    name_source_hashes = {
        name: load(LOCALES / name)[1]
        for name in (
            "source.json", "zhCN.json", "zhTW.json",
            "map-entity-source.json", "map-entity-zhCN.json",
            "map-entity-zhTW.json",
        )
    }
    entries = {}
    adjusted_count = 0
    traditional_by_source = defaultdict(set)
    for index, (key, english) in enumerate(zip(source["keys"], source["values"])):
        tw = traditional["values"][index]
        if tw:
            traditional_by_source[(key.split(":", 1)[1], english)].add(tw)
    for key, entry in reviewed["entries"].items():
        tw = entry.get("locales", {}).get("zhTW")
        if tw:
            traditional_by_source[(key.split(":", 1)[1], entry["en"])].add(tw)
    for index, (key, english) in enumerate(zip(source["keys"], source["values"])):
        if simplified["values"][index]:
            continue
        reviewed_entry = reviewed["entries"].get(key)
        if reviewed_entry and reviewed_entry["en"] != english:
            raise ValueError(f"{key}: reviewed English text changed")
        exact_matches = traditional_by_source[(key.split(":", 1)[1], english)]
        tw = (traditional["values"][index] or
              (reviewed_entry or {}).get("locales", {}).get("zhTW") or
              (next(iter(exact_matches)) if len(exact_matches) == 1 else None))
        if not tw:
            continue
        converted, adjustments = adjust_names(english, converter.convert(tw), pairs)
        if converted == english or not re.search(r"[\u4e00-\u9fff]", converted):
            continue
        if tw.count("\n") != converted.count("\n") or \
                re.findall(r"\$[A-Za-z]", tw) != re.findall(r"\$[A-Za-z]", converted):
            raise ValueError(f"{key}: quest formatting changed")
        entries[key] = converted
        adjusted_count += adjustments
    catalog = {
        "version": 1,
        "sourceSha256": source_hash,
        "zhCnSha256": cn_hash,
        "zhTwSha256": tw_hash,
        "reviewedProseSha256": reviewed_hash,
        "nameSourceSha256": name_source_hashes,
        "converter": "opencc-python-reimplemented 0.1.7 tw2s",
        "nameAdjustments": adjusted_count,
        "entries": entries,
    }
    rendered = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            raise ValueError("zhCN derived quest prose is stale")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"zhCN: {len(entries)} converted fields; {adjusted_count} client name adjustments")


if __name__ == "__main__":
    main()
