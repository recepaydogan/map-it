"""Prepare source-backed terminology repairs for retained English display text.

Native exports remain untouched. The resulting phrase matrix is reviewed before
being applied to supplementary prose, outside protected native names and links.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build-content-locales.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

TAGS = {"Veilwater Basin": "3619607455", "Vailwater Basin": "3619607455",
        "Vukah": "388130378", "Drak": "3175261909", "Spark": "2259947478",
        "Coloring Station": "1315548166", "Fired Brick": "820932378", "Copper Bar": "2060595025",
        "Scientific Instruments": "2045925678", "Slick Fade Wig Head": "2435074565"}
ALIASES = {"Exilir Wells": "Elixir Wells", "Revelwoods Dirt": "Revelwood Dirt", "Vieled Vigor": "Veiled Vigor",
           "Slayed Dragons": "Slain Dragons", "Athalan Skee": "Athalan Skree", "Drak Chieftan": "Drak Chieftain",
           "Eternal Chain Lighting": "Eternal Chain Lightning", "Commo": "Common"}
CONTEXTS = {"Craft Time": "Crafting time", "Staffs And": "Staves and", "Field Orb": "Area orb",
            "Baby Dune": "Baby desert", "Baby Flightless": "Flightless chick", "Deep Dive": "Deep dive",
            "Drak Enemy Drop": "Dropped by Drak enemies", "Enemy Drop": "Dropped by enemies",
            "Rested Bonus": "Rested status bonus", "Lootable Chest": "Lootable chest",
            "Lootable Chests": "Lootable chests", "Wind Ward": "Wind protection",
            "Better Axes": "Better axes", "Ornate Chest": "Ornate treasure chest",
            "Epic Baits": "Epic fishing baits", "Uncommon Baits": "Uncommon fishing baits",
            "Any Fishing Junk": "Any junk caught while fishing", "Health Orb": "Health orb",
            "Stamina On Hit": "Stamina restored on hit", "Damage against shroud": "Damage against Shroud enemies",
            "Backstabbing Damage": "Backstab damage", "Retreating Barrage": "Retreating barrage",
            "Food Buffs": "Food bonuses", "Animals Husbandry": "Animal husbandry"}
KEEP = {"twitch drops"}


def normalize(value):
    return re.sub(r"\s+", " ", builder.plain(value)).strip().strip('“”"').casefold()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--translate", action="store_true")
    args = parser.parse_args()
    source = builder.read(builder.PACKS / "source.json")
    locales = {code: builder.read(builder.PACKS / (game_code.replace("_", "-").lower() + ".json"))["values"]
               for code, game_code in builder.LANGUAGES.items()}
    index, by_tag = {}, {tag: i for i, tag in enumerate(source["keys"])}
    for i, value in enumerate(source["values"]):
        index.setdefault(normalize(value), []).append(i)
    def native(term, code):
        canonical = ALIASES.get(term, term)
        indexes = [by_tag[TAGS[term]]] if term in TAGS else index.get(normalize(canonical), [])
        if not indexes and canonical.endswith("s"):
            indexes = index.get(normalize(canonical[:-1]), [])
        values = {builder.plain(locales[code][i]) for i in indexes if locales[code][i]}
        return next(iter(values)) if len(values) == 1 else None
    candidates = builder.read(builder.RESEARCH / "deep-audit-candidates.json")
    terms = {}
    for code, report in candidates.items():
        for entry in report["retained"]:
            term = entry["phrase"]
            if term.casefold() not in KEEP:
                terms.setdefault(term, set()).add(code)
        for entry in report["unchanged"]:
            if entry["provenance"] in "SV":
                terms.setdefault(entry["english"], set()).add(code)
    # Numeric stat strings need the same noun translations at every value.
    content_source = builder.read(builder.OUT / "source.json")
    for code in ("de", "fr", "it", "es", "pl", "pt-BR", "tr"):
        values = builder.read(builder.OUT / f"{code.lower()}.json")["values"]
        provenance = builder.read(builder.RESEARCH / "content-drafts" / f"{code.lower()}-provenance.json")["codes"]
        for text, translated, origin in zip(content_source["values"], values, provenance):
            if origin != "S" or text != translated:
                continue
            if re.match(r"[+\-\d]", text) and re.search(r"Health|Stamina|Damage|Resistance|Regeneration|Healing|Armor", text):
                terms.setdefault(text, set()).add(code)
    literal_words = {"enshrouded", "companion", "wiki", "overwolf", "discord", "keen", "games", "twitch", "drops",
                     "npc", "npcs", "xp", "min", "sec", "png", "jpg", "webp", "https", "http", "www", "com", "org", "net",
                     "lupa", "polaris", "fyraszh", "dalszul", "arisztar", "merphisz", "bbb", "zzzrrr", "krrrraallllll", "hrrrrggg"}
    grammar_words = {"and", "the", "for", "this", "from", "that", "with", "into", "after", "before", "can", "you", "your",
                     "his", "her", "their", "they", "are", "will", "has", "have", "not", "but", "was", "its", "out", "all", "one", "two"}
    for code in ("ru", "uk", "ja", "ko", "th", "zh-Hans", "zh-Hant"):
        values = builder.read(builder.OUT / f"{code.lower()}.json")["values"]
        provenance = builder.read(builder.RESEARCH / "content-drafts" / f"{code.lower()}-provenance.json")["codes"]
        for english, translated, origin in zip(content_source["values"], values, provenance):
            if origin not in "SV":
                continue
            visible = re.sub(r"\{\{.*?\}\}|\[\[.*?\]\]|https?://\S+", "", translated)
            for word in re.findall(r"[A-Za-z]{3,}", visible):
                if word.casefold() in literal_words | grammar_words or re.fullmatch(r"[IVXLCDM]+", word):
                    continue
                if word.casefold() in english.casefold():
                    terms.setdefault(word, set()).add(code)
    records, pending = {}, {}
    for term, codes in terms.items():
        row = {"translations": {}, "nativeLanguages": [], "reviewStatus": "draft"}
        for code in codes:
            value = native(term, code)
            if value:
                row["translations"][code] = value
                row["nativeLanguages"].append(code)
            else:
                pending.setdefault(code, []).append((term, CONTEXTS.get(term, ALIASES.get(term, term))))
        records[term] = row
    cache_dir = Path(tempfile.gettempdir()) / "enshrouded-localization-cache/phrase-review"
    for code, entries in pending.items():
        cache_path = cache_dir / f"{code.lower()}.json"
        cache = builder.read(cache_path) if cache_path.is_file() else {}
        requests, keys = [], {}
        for term, text in entries:
            key = hashlib.sha256(text.encode()).hexdigest()[:24]
            keys.setdefault(key, []).append(term)
            if key not in cache and not any(existing[0] == key for existing in requests):
                requests.append((key, text))
        print(f"{code}: {len(entries)} phrase translations; {len(requests)} uncached", flush=True)
        if args.translate:
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(builder.translator.translate_chunk, code, requests[i:i + 12])
                           for i in range(0, len(requests), 12)]
                for future in as_completed(futures):
                    cache.update(future.result())
                    builder.atomic_json(cache_path, cache)
        for key, mapped_terms in keys.items():
            if key in cache:
                for term in mapped_terms:
                    records[term]["translations"][code] = cache[key]
    builder.atomic_json(builder.RESEARCH / "content-phrase-review-draft.json", records)
    print(f"Prepared {len(records)} retained-phrase review records", flush=True)


if __name__ == "__main__":
    main()
