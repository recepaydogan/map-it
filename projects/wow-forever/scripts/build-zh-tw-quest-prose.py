"""Derive missing zhTW quest prose from matching zhCN fields and client names.

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
OUTPUT = ROOT / "data/quest-text-localization/zh-tw-derived.json"


def load(name):
    path = LOCALES / name
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def token_in_text(token, text):
    return bool(re.search(r"(?<![A-Za-z])" + re.escape(token) + r"(?![A-Za-z])", text))


def name_pairs(converter):
    candidates = defaultdict(Counter)
    for prefix in ("", "map-entity-"):
        source, _ = load(prefix + "source.json")
        simplified, _ = load(prefix + "zhCN.json")
        traditional, _ = load(prefix + "zhTW.json")
        for english, cn, tw in zip(
            source["values"], simplified["values"], traditional["values"]
        ):
            if not cn or not tw or not isinstance(english, str) or len(english) < 3:
                continue
            converted = converter.convert(cn)
            if len(converted) >= 2 and converted != tw:
                candidates[(english, converted)][tw] += 1
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
    converter = OpenCC("s2tw")
    source, source_hash = load("quest-text-source.json")
    simplified, cn_hash = load("quest-text-zhCN.json")
    traditional, tw_hash = load("quest-text-zhTW.json")
    if not (len(source["keys"]) == len(source["values"]) ==
            len(simplified["values"]) == len(traditional["values"])):
        raise ValueError("Quest text packs have different lengths")
    pairs = name_pairs(converter)
    name_source_hashes = {
        name: load(name)[1]
        for name in (
            "source.json", "zhCN.json", "zhTW.json",
            "map-entity-source.json", "map-entity-zhCN.json",
            "map-entity-zhTW.json",
        )
    }
    entries = {}
    adjusted_count = 0
    for key, english, cn, tw in zip(
        source["keys"], source["values"],
        simplified["values"], traditional["values"]
    ):
        if tw or not cn:
            continue
        converted, adjustments = adjust_names(english, converter.convert(cn), pairs)
        if converted == english or not re.search(r"[\u4e00-\u9fff]", converted):
            continue
        if cn.count("\n") != converted.count("\n"):
            raise ValueError(f"{key}: paragraph breaks changed")
        if re.findall(r"\$[A-Za-z]", cn) != re.findall(r"\$[A-Za-z]", converted):
            raise ValueError(f"{key}: substitution tokens changed")
        entries[key] = converted
        adjusted_count += adjustments
    catalog = {
        "version": 1,
        "sourceSha256": source_hash,
        "zhCnSha256": cn_hash,
        "zhTwSha256": tw_hash,
        "nameSourceSha256": name_source_hashes,
        "converter": "opencc-python-reimplemented 0.1.7 s2tw",
        "nameAdjustments": adjusted_count,
        "entries": entries,
    }
    rendered = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            raise ValueError("zhTW derived quest prose is stale")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"zhTW: {len(entries)} converted fields; {adjusted_count} client name adjustments")


if __name__ == "__main__":
    main()
