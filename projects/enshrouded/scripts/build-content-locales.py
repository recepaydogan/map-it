"""Build complete display dictionaries from official text and supplementary prose.

Content IDs, recipe keys, wiki targets and source catalogs remain English.
Game terms inside supplementary sentences are protected during translation and
resolved from the official language glossary afterward. Wiki link syntax and
interpolation tokens are preserved. Cache entries are bound to their source
template, so changed text cannot silently retain an obsolete translation.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import time
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "public/data/enshrouded/locales"
OUT = ROOT / "public/data/enshrouded/content-locales"
RESEARCH = ROOT / "research/localization"
SPEC = importlib.util.spec_from_file_location("app_translator", ROOT / "scripts/translate-app-locales.py")
translator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(translator)
LANGUAGES = translator.LANGUAGES
# Source tags verified against the installed game. These resolve action/noun
# homonyms for map categories, without selecting the first matching English tag.
TAG_OVERRIDES = {
    "Mine": "3820022214", "Night Sanctum": "145949192",
    "Shroud": "302477978", "Fell": "901241245", "Hollow": "46969622",
    "Scavengers": "666657602", "Scavenger": "1123390364", "Flame": "344288827", "Hollow Halls": "56015203",
    "Blacksmith": "727176490", "Farmer": "53345828", "Carpenter": "909245737",
    "Collector": "2276518262", "Alchemist": "1189666570", "Bard": "1539948162",
    "Hunter": "923149976", "Mauveine": "2828805345", "Cinder's Cradle": "661006542",
    "Blink": "703437488",
    "Ancients": "1698922803", "Flameborn": "765415468", "Lore": "3835482912",
    "Umber Hollow": "3856193590",
}
NATIVE_LABEL_ALIASES = {"Umbra Hollow": "Umber Hollow"}
DERIVED_GAME_TERMS = {"Archaic Essence": "2745895815", "Archaic Essense": "2745895815",
                      "Drak Relief": "3818362057", "Flame Mosaic Piece": "1014002999", "Wall Tapestry": "95940382"}
DISPLAY_LABEL_KEYS = {"Type": "buildingGuide.facts.type", "Set": "buildingGuide.facts.set",
                      "Range": "map.enshrouded.weaponStats.range"}
DISPLAY_LABEL_ALIASES = {label.casefold(): key for label, key in DISPLAY_LABEL_KEYS.items()}


def plain(value):
    return html.unescape(re.sub(r"<[^>]*>", "", value)).strip()


def normalize(value):
    value = plain(value).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    value = re.sub(r"'{2,3}", "", value)
    value = re.sub(r"\s+([,.!?;:])", r"\1", value)
    return re.sub(r"\s+", " ", value).strip().lower()


def plain_wiki_tables(value):
    def table(match):
        headers, rows = [], []
        def cell_text(cell):
            return re.sub(r"\s+\*\s+", ", ", re.sub(r"^\*\s*", "", cell.strip()))
        for index, chunk in enumerate(match[1].split("|-")):
            caption = re.search(r"\|\+\s*([^!]*)", chunk)
            if caption and caption[1].strip():
                rows.append(caption[1].strip())
            start = chunk.find("!")
            if chunk.strip().startswith("!") or index == 0 and start >= 0:
                headers = [cell_text(cell) for cell in chunk[start + 1:].split("!!")]
            elif index > 0 and chunk.strip():
                cells = [cell_text(cell) for cell in re.sub(r"^\s*\|", "", chunk).split("||")]
                rows.append("; ".join((headers[i] + ": " if i < len(headers) and headers[i] else "") + (cell or "—") for i, cell in enumerate(cells)))
        return ". ".join(rows) + "." if rows else ""
    return re.sub(r"\{\|([\s\S]*?)\|\}", table, value)


def polish_authored_text(code, value):
    if code != "fr":
        return value
    def prose(text):
        # Native nouns replace opaque glossary markers after translation. Restore
        # the agreement/elision that the translator could not see behind them.
        def feminine(match):
            article, noun = match[1], match[2]
            replacements = {"le": "la", "du": "de la", "au": "à la", "un": "une", "ce": "cette", "son": "sa"}
            replacement = replacements[article.lower()]
            if article.lower() == "son" and noun[0].lower() in "aeiouéèêëàâîïôùûü":
                replacement = "son"
            if article[0].isupper():
                replacement = replacement[0].upper() + replacement[1:]
            return replacement + " " + noun
        text = re.sub(r"\b(le|du|au|un|ce|son)\s+(Flamme|Brume|Tour des Anciens|Racine de Brume|Étincelle|Forge de pierres précieuses)\b",
                      feminine, text, flags=re.I)
        return re.sub(r"\b([LlDd])(?:e|a)\s+(?=[AEIOUÀÂÉÈÊËÎÏÔÙÛÜaeiouàâéèêëîïôùûü])", r"\1’", text)
    # Wiki targets and interpolation variables must stay byte-for-byte intact.
    parts = re.split(r"(\{\{[^{}]*\}\}|\[\[[^\]]*\]\])", value)
    return "".join(part if index % 2 else prose(part) for index, part in enumerate(parts))


def restore_authored_terms(code, value, replacements, polish=True):
    if not replacements:
        return polish_authored_text(code, value) if polish else value
    pattern = re.compile("|".join(re.escape(token) for token in replacements))
    parts, cursor = [], 0
    for match in pattern.finditer(value):
        before, native = value[cursor:match.start()], replacements[match[0]]
        if polish:
            before = polish_authored_text(code, before)
            joined = polish_authored_text(code, before + native)
            # Correct surrounding grammar only when the authentic native label
            # remains an exact suffix. Never rewrite the interior of a game name.
            if native and joined.endswith(native):
                before = joined[:-len(native)]
        parts.extend((before, native))
        cursor = match.end()
    tail = value[cursor:]
    parts.append(polish_authored_text(code, tail) if polish else tail)
    return "".join(parts)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def reviewed_phrase_replacer(code, reviews):
    terms = {english.casefold(): entry["translations"][code]
             for english, entry in reviews.items() if code in entry["translations"]}
    if any(entry.get("reviewStatus") != "reviewed" for entry in reviews.values()):
        raise ValueError("Unreviewed supplementary terminology")
    pattern = re.compile(r"(?<![A-Za-z0-9_])(?:" + "|".join(
        re.escape(term) for term in sorted(terms, key=len, reverse=True)) + r")(?![A-Za-z0-9_])", re.I)
    def replace(value):
        # Source link targets, interpolation variables and authentic native
        # labels are still opaque at this stage. Do not rewrite their interiors.
        parts = re.split(r"(\{\{[^{}]*\}\}|\[\[[^\]]*\]\]|https?://\S+)", value)
        return "".join(part if i % 2 else pattern.sub(lambda match: terms[match[0].casefold()], part)
                       for i, part in enumerate(parts))
    return replace


def derived_game_text(english, source, values, index_by_tag):
    tag = DERIVED_GAME_TERMS.get(english)
    if tag is None:
        return None
    index = index_by_tag[tag]
    canonical = "Archaic Essence" if english == "Archaic Essense" else english
    if normalize(source["values"][index]) != normalize(canonical + " I"):
        raise ValueError(f"The verified generic glossary requires the current tier-I game tag: {canonical}")
    text = plain(values[index])
    suffix = re.search(r"\s*(?:I|1)$", text)
    if suffix is None:
        raise ValueError(f"Unverified tier suffix for generic game term: {text}")
    return text[:suffix.start()].rstrip()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for attempt in range(12):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 11:
                raise
            time.sleep(min(0.05 * 2 ** attempt, 0.8))


def inputs():
    inventory = read(RESEARCH / "content-inventory.json")
    strings = {row["english"] for row in inventory["strings"]}
    names = set()
    contextual_sources = {}
    prose_sources = set()
    reward_sources = set()
    for file, fields in inventory["fields"].items():
        for field in fields:
            if field["path"].endswith((".name", ".label", ".role", ".faction", ".biome")):
                names.add(inventory["strings"][field["string"]]["english"])
    # Display text in dictionary-shaped indexes has no conventional field key.
    for name in ("wiki-obtaining-index.json",):
        values = {value for value in read(ROOT / "public/data/enshrouded" / name).values() if isinstance(value, str)}
        strings.update(values)
        prose_sources.update(values)
    for path in (ROOT / "public/data/enshrouded").glob("*.json"):
        def visit(value):
            if isinstance(value, dict):
                name, item_type = value.get("name"), value.get("type")
                if isinstance(name, str) and isinstance(item_type, str) and "Upper Body" in item_type and name.endswith(" Chest"):
                    contextual_sources[name] = name + " Armor"
                fact_name, fact_value = value.get("name", ""), value.get("value", "")
                if isinstance(fact_name, str) and isinstance(fact_value, str):
                    if re.match(r"^effects?\d*$", fact_name, re.I):
                        normalized = re.sub(r"([+-])\s+(?=\d)", r"\1", fact_value)
                        for part in re.split(r"\s+(?=[+-]\d)", normalized):
                            strings.add(part.strip())
                            effect = re.match(r"^[+-]\d+(?:\.\d+)?%?\s*(.*)$", part.strip())
                            if effect:
                                strings.add(effect[1])
                    if fact_name.lower() == "perks":
                        strings.update(part.strip() for part in fact_value.split(","))
                for key, child in value.items():
                    if key in {"obtaining", "obtainingText"} and isinstance(child, str):
                        prose_sources.add(child)
                    if isinstance(child, str) and (key == "reward" or key == "text" and re.match(r"^Reward\s*:", child, re.I)):
                        reward_sources.add(child)
                    if key in {"biome", "faction", "stations", "workstations", "headers", "bait", "bed", "feeder", "food", "resource", "yieldLinks", "obtainedLinks"}:
                        if isinstance(child, str):
                            strings.add(child)
                            names.add(child)
                        elif isinstance(child, list):
                            strings.update(v for v in child if isinstance(v, str))
                            names.update(v for v in child if isinstance(v, str))
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)
        visit(read(path))
    for value in list(strings):
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", value):
            strings.add(re.sub(r"([a-z])(\d)", r"\1 \2", re.sub(r"([a-z])([A-Z])", r"\1 \2", value)).capitalize()
                        if value.islower() else re.sub(r"([a-z])([A-Z])", r"\1 \2", value))
    # Derive only fragments that components actually display. Splitting every
    # paragraph on commas loses sentence context and creates unused translations.
    for value in prose_sources:
        for method in re.split(r"\n|\s+(?=(?:Farmable from|Gathered from|Gatherable from)\b)", value):
            method = re.sub(r"\s+([,.!?;:])", r"\1", method).strip()
            strings.add(method)
            capture = re.match(r"^(?:Gatherable\s*-|Gatherable from|Farmable from|Gathered from|Dropped by|Lootable\s*-?|Fished with|Found in|Reward from)\s+(.+)$", method, re.I)
            if capture:
                strings.add(capture[1].strip())
            world_drop = re.match(r"^World Drop\s*\(\s*(.*?)\s*\)$", method, re.I)
            if world_drop:
                strings.add(world_drop[1])
    for value in reward_sources:
        value = re.sub(r"^Reward\s*:\s*", "", value, flags=re.I)
        value = re.sub(r"\b[\d,]+\s*XP\b|\b\d+\s+Recipes?\b|\band\b", "", value, flags=re.I)
        strings.add(value.replace(",", " ").strip())
    building = read(ROOT / "public/data/enshrouded/building-catalog.json")
    for record in building["records"] + building["relatedRecords"]:
        value = (record.get("availability") or {}).get("text", "")
        if value.startswith("Obtaining "):
            strings.add("Unlock the recipe by obtaining " + value[len("Obtaining "):] + ".")
    strings.update(("Unlock the recipe by obtaining Sand, then craft it at the Farmer.",
                    "Mine ice in the Albaneve Summits.", "Mine snow in the Albaneve Summits."))
    # Templates parsed into links must retain their English destinations.
    for value in list(strings):
        for token in re.findall(r"\[\[[^\]]*\]\]|\{\{[^{}]*\}\}", value):
            fields = [part.strip() for part in token[2:-2].split("|")]
            if token.startswith("[["):
                strings.add(fields[-1])
            else:
                positional = [part for part in fields[1:] if part and not re.match(r"^[\w -]+=", part)]
                if positional:
                    strings.add(positional[-1])
    strings = {value for value in strings if value.strip() and re.search(r"[A-Za-z]", value)
               and not value.startswith(("data/", "maps/"))}
    # Imported stat identifiers are displayed in both their raw and capitalized
    # forms. Translate their meaning instead of sending concatenated code names.
    stat_names = {"attackspeed": "Attack speed", "drawspeed": "Draw speed", "arrowspeed": "Arrow speed",
                  "parrypower": "Parry power", "manaregeneration": "Mana regeneration", "crafter": "Crafting specialist"}
    rarities = {"common": "Common", "uncommon": "Uncommon", "rare": "Rare", "epic": "Epic", "legendary": "Legendary"}
    for value in strings:
        if "{|" in value:
            contextual_sources[value] = plain_wiki_tables(value)
        compact = re.sub(r"[\s_-]", "", value).lower()
        upgrade = re.fullmatch(r"upgrade(common|uncommon|rare|epic|legendary)(phys|magic)?", compact)
        numbered = re.fullmatch(r"(effects?|workshop)(\d+)", compact)
        if upgrade:
            suffix = {"phys": "physical armor", "magic": "magical armor", None: "bonus"}[upgrade[2]]
            contextual_sources[value] = f"{rarities[upgrade[1]]} upgrade: {suffix}"
        elif numbered:
            contextual_sources[value] = f"{'Workstation' if numbered[1] == 'workshop' else 'Effect'} {numbered[2]}"
        elif compact in stat_names:
            contextual_sources[value] = stat_names[compact]
    contextual_sources["Set"] = "Equipment set"
    names.update(("Shroud", "Fell", "Hollow", "Scavengers", "Vukah", "Drak", "Flame", "Embervale"))
    names.update(TAG_OVERRIDES)
    names.update(NATIVE_LABEL_ALIASES)
    names.update(DERIVED_GAME_TERMS)
    return strings, names, contextual_sources


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--languages", default=",".join(code for code in LANGUAGES if code != "en"))
    cli.add_argument("--prepare-only", action="store_true")
    cli.add_argument("--workers", type=int, default=4)
    cli.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "enshrouded-localization-cache")
    cli.add_argument("--sync-ui", action="store_true")
    cli.add_argument("--reuse-packs", type=Path, help="Retain exact unchanged strings from aligned, previously reviewed packs")
    args = cli.parse_args()
    official = read(PACKS / "source.json")
    official_values = {code: read(PACKS / (game_code.replace("_", "-").lower() + ".json"))["values"] for code, game_code in LANGUAGES.items()}
    app_labels = {code: dict(translator.flatten(read(translator.LOCALES / f"{code.lower()}.json"))) for code in LANGUAGES}
    for label, key in DISPLAY_LABEL_KEYS.items():
        if app_labels["en"].get(key) != label or any(not values.get(key) for values in app_labels.values()):
            raise ValueError(f"Missing reviewed display-label context: {label}:{key}")
    index_by_tag = {tag: i for i, tag in enumerate(official["keys"])}
    explicit_game_tags = {}
    marker_panels_path = ROOT / "public/data/enshrouded/marker-panels.json"
    if marker_panels_path.is_file():
        for panel in read(marker_panels_path)["markers"].values():
            for paragraph in panel["paragraphs"]:
                tag = paragraph.get("textKey")
                if not tag:continue
                if tag not in index_by_tag or normalize(paragraph["text"]) != normalize(official["values"][index_by_tag[tag]]):
                    raise ValueError(f"Marker paragraph no longer matches its official text tag: {tag}")
                explicit_game_tags.setdefault(paragraph["text"], set()).add(tag)
    by_normalized = {}
    for i, value in enumerate(official["values"]):
        if value:
            by_normalized.setdefault(normalize(value), []).append(i)
    format_aliases = read(ROOT / "scripts/reviewed-native-format-aliases.json")
    def compact_text(value):
        return "".join(char for char in plain(value).casefold() if char.isalnum())
    for english, tag in format_aliases.items():
        native = official["values"][index_by_tag[tag]]
        if compact_text(english) != compact_text(native) or re.findall(r"\d+(?:[.,]\d+)?", english) != re.findall(r"\d+(?:[.,]\d+)?", plain(native)):
            raise ValueError(f"Stale format-only native alias: {tag}")
    def from_game(english, code):
        if english in explicit_game_tags:
            values = {plain(official_values[code][index_by_tag[tag]]) for tag in explicit_game_tags[english]}
            if len(values) == 1:return next(iter(values))
        # The native label "Set" is the placement action (TR Belirle, DE
        # Platzieren). Catalog attributes use the equipment-set noun instead.
        if english == "Set":
            return None
        if english in format_aliases:
            return plain(official_values[code][index_by_tag[format_aliases[english]]])
        if english in DERIVED_GAME_TERMS:
            return derived_game_text(english, official, official_values[code], index_by_tag)
        canonical = NATIVE_LABEL_ALIASES.get(english, english)
        candidates = [index_by_tag[TAG_OVERRIDES[canonical]]] if canonical in TAG_OVERRIDES else by_normalized.get(normalize(canonical), [])
        # Wiki dialogue adds an outer quotation pair to otherwise verbatim
        # game text. Prefer the native dialogue when its full text agrees.
        normalized = normalize(english)
        if not candidates and len(normalized) > 80 and normalized.startswith('"') and normalized.endswith('"'):
            candidates = by_normalized.get(normalized[1:-1].strip(), [])
        if canonical in TAG_OVERRIDES and normalize(official["values"][candidates[0]]) != normalize(canonical):
            raise ValueError(f"Stale canonical game term {canonical}: {TAG_OVERRIDES[canonical]}")
        values = {plain(official_values[code][i]) for i in candidates if official_values[code][i]}
        return next(iter(values)) if len(values) == 1 else None
    strings, names, contextual_sources = inputs()
    reviewed_labels = read(ROOT / "scripts/reviewed-content-labels.json")
    wiki_records = read(ROOT / "public/data/enshrouded/wiki-catalog.json")["records"]
    for english, entry in reviewed_labels.items():
        if entry["context"] == "map-category":
            if app_labels["en"].get(entry["uiKey"]) != english:
                raise ValueError(f"Reviewed map category context has changed: {english}")
            continue
        record = next((record for record in wiki_records if record["name"] == english), None)
        if record is None or record.get("type") != entry["context"]:
            raise ValueError(f"Reviewed label context has changed: {english}")
    def from_glossary(english, code):
        return from_game(english, code) or reviewed_labels.get(english, {}).get("translations", {}).get(code)
    names.update(reviewed_labels)
    glossary = {name for name in names if len(name) >= 3 and len(name) <= 90 and name[0].isupper() and re.search(r"[A-Za-z]", name)
                and all(from_glossary(name, code) for code in LANGUAGES)}
    # Do not mask ordinary grammar merely because an item has the same name.
    glossary.difference_update({"All", "None", "Any", "Other", "General", "Yes", "Can", "Unknown", "Light", "Normal", "Small", "Large", "Heavy", "Fine", "Mine",
        "Set", "Rebuilding", "Description", "Default", "Location", "Source", "Level", "Speed", "Healing", "Tired", "Deserted", "Dreaming", "Forsaken", "Antique", "Comfort", "Type", "Item", "Quests", "Date", "Fortified", "Fortification", "Banishment", "Convergence", "Prowl", "Spark", "War",
        "Enshrouded", "Enshrouded Companion", "Overwolf", "Discord"})
    ordered_terms = sorted(glossary, key=lambda value: (-len(value), value))
    term_pattern = re.compile(r"(?<![\w])(?:" + "|".join(re.escape(term) for term in ordered_terms) + r")(?![\w])")
    protected_pattern = re.compile(r"\{\{[^{}]*\}\}|\[\[[^\]]*\]\]")
    brand_pattern = re.compile(r"Enshrouded(?: Companion)?|Overwolf|Discord")
    rows = []
    for english in sorted(strings):
        tokens = []
        def protect(match):
            token = "{{EMTERM_" + str(len(tokens)) + "}}"
            tokens.append({"english": match.group(), "literal": True})
            return token
        template = protected_pattern.sub(protect, contextual_sources.get(english, english))
        def term(match):
            token = "{{EMTERM_" + str(len(tokens)) + "}}"
            tokens.append({"english": match.group(), "literal": False})
            return token
        template = term_pattern.sub(term, template)
        template = brand_pattern.sub(protect, template)
        key = hashlib.sha256(english.encode()).hexdigest()[:24]
        rows.append({"key": key, "english": english, "template": template, "terms": tokens})
    source_hash = hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    atomic_json(OUT / "source.json", {"version": 1, "keys": [row["key"] for row in rows], "values": [row["english"] for row in rows], "sourceSha256": source_hash})
    atomic_json(RESEARCH / "content-translation-source.json", {"version": 1, "sourceSha256": source_hash, "glossaryTerms": ordered_terms, "rows": rows})
    print(f"Prepared {len(rows)} distinct display strings; {len(glossary)} protected official terms", flush=True)
    if args.prepare_only:
        return
    # A targeted repair must retain the other current language exports in the
    # manifest. Failed requested languages are removed again below.
    reports = {}
    display_reviews = read(ROOT / "scripts/reviewed-display-overrides.json")
    phrase_review_path = ROOT / "scripts/reviewed-content-phrases.json"
    phrase_reviews = read(phrase_review_path)
    phrase_review_hash = hashlib.sha256(phrase_review_path.read_bytes()).hexdigest()
    failed_languages = []
    for code in LANGUAGES:
        if code == "en":
            continue
        report_path = RESEARCH / "content-drafts" / f"{code}-report.json"
        pack_path = OUT / f"{code.lower()}.json"
        if report_path.is_file() and pack_path.is_file():
            report, pack = read(report_path), read(pack_path)
            if report.get("sourceSha256") == source_hash and pack.get("sourceSha256") == source_hash \
                    and len(pack.get("values", [])) == len(rows):
                reports[code] = report
    for code in args.languages.split(","):
        if code == "en" or code not in LANGUAGES:
            raise ValueError(f"Unsupported language {code}")
        replace_phrases = reviewed_phrase_replacer(code, phrase_reviews)
        phrase_repairs = 0
        cache_path = args.cache_dir / f"{code}.json"
        if not cache_path.is_file():
            prior_paths = [RESEARCH / "content-drafts" / f"{code}.json", RESEARCH / "content-drafts" / f"{code}.json.tmp"]
            prior = [read(path) for path in prior_paths if path.is_file()]
            if prior:
                atomic_json(cache_path, max(prior, key=lambda value: len(value.get("values", {}))))
        cached = read(cache_path) if cache_path.is_file() else {}
        prose_override_path = ROOT / "scripts/content-localization-overrides" / f"{code.lower()}.json"
        prose_overrides = read(prose_override_path) if prose_override_path.is_file() else {}
        cache = cached.get("values", {})
        by_template = {entry["templateSha256"]: entry["translation"] for entry in cache.values()}
        resolved = {}
        pending = []
        aliases = {}
        provenance = {}
        retained = {}
        retained_overrides = set()
        if args.reuse_packs:
            old_source = read(args.reuse_packs / "source.json")
            old_pack = read(args.reuse_packs / f"{code.lower()}.json")
            old_provenance = read(args.reuse_packs / f"{code.lower()}-provenance.json")
            assert old_source["sourceSha256"] == old_pack["sourceSha256"] == old_provenance["sourceSha256"]
            assert old_pack["phraseReviewSha256"] == phrase_review_hash
            assert old_pack["contextReviewSha256"] == hashlib.sha256((ROOT / "scripts/reviewed-term-contexts.json").read_bytes()).hexdigest()
            assert old_pack["nativeFormatAliasSha256"] == hashlib.sha256((ROOT / "scripts/reviewed-native-format-aliases.json").read_bytes()).hexdigest()
            assert old_pack["nativeLocaleSha256"] == hashlib.sha256((PACKS / (LANGUAGES[code].replace("_", "-").lower() + ".json")).read_bytes()).hexdigest()
            assert len(old_source["values"]) == len(old_pack["values"]) == len(old_provenance["codes"])
            retained = {english:(value, provenance_code) for english,value,provenance_code in
                        zip(old_source["values"],old_pack["values"],old_provenance["codes"])}
            retained_overrides = set(old_pack.get("nativeDisplayOverrides", []))
        retained_keys = set()
        for row in rows:
            key = row["key"]
            if row["english"] in retained:
                value, provenance_code = retained[row["english"]]
                resolved[key] = value
                provenance[key] = {"O":"official","R":"reviewed","V":"reviewed-supplementary",
                                   "S":"supplementary","G":"glossary"}[provenance_code]
                retained_keys.add(key)
                continue
            display_review = display_reviews.get(row["english"], {}).get(code)
            if display_review:
                resolved[key] = display_review
                provenance[key] = "reviewed"
                continue
            app_label_key = DISPLAY_LABEL_ALIASES.get(row["english"].strip().casefold())
            if app_label_key:
                resolved[key] = app_labels[code][app_label_key]
                provenance[key] = "reviewed"
                continue
            digest = hashlib.sha256(row["template"].encode()).hexdigest()
            prose_override = prose_overrides.get(key)
            if prose_override:
                if prose_override.get("english") != row["english"] or prose_override.get("templateSha256") != digest:
                    raise ValueError(f"Stale reviewed prose override: {code}:{key}")
                resolved[key] = prose_override["translation"]
                provenance[key] = "reviewed-supplementary"
                continue
            game = from_game(row["english"], code)
            if game:
                resolved[key] = game
                provenance[key] = "official"
                continue
            reviewed = reviewed_labels.get(row["english"], {}).get("translations", {}).get(code)
            if reviewed:
                resolved[key] = reviewed
                provenance[key] = "reviewed"
                continue
            cached_row = cache.get(key)
            unmasked = re.sub(r"\{\{EMTERM_\d+\}\}", "", row["template"])
            unmasked = re.sub(r"\bx\s*(?=\d)", "", unmasked, flags=re.I)
            if not re.search(r"[A-Za-z]", unmasked):
                resolved[key] = row["template"]
                provenance[key] = "glossary"
            elif (cached_row and cached_row["templateSha256"] == digest) or digest in by_template:
                resolved[key] = cached_row["translation"] if cached_row and cached_row["templateSha256"] == digest else by_template[digest]
                provenance[key] = "supplementary"
            else:
                if digest not in aliases:
                    pending.append((key, row["template"]))
                    aliases[digest] = []
                aliases[digest].append(key)
        chunks = []
        current = []
        size = 0
        for entry in pending:
            if current and (len(current) >= 24 or size + len(entry[1]) > 2600):
                chunks.append(current)
                current, size = [], 0
            current.append(entry)
            size += len(entry[1]) + 30
        if current:
            chunks.append(current)
        print(f"{code}: {len(resolved)} resolved; {len(pending)} supplementary strings in {len(chunks)} batches", flush=True)
        templates_by_key = {row["key"]: row["template"] for row in rows}
        failures = []
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(translator.translate_chunk, code, entries) for entries in chunks]
            for number, future in enumerate(as_completed(futures), 1):
                try:
                    translated = future.result()
                except Exception as error:
                    failures.append({"error": str(error), "cause": str(error.__cause__)})
                    atomic_json(RESEARCH / "content-drafts" / f"{code}-errors.json", failures)
                    print(f"{code}: retained a failed batch for review: {error.__cause__ or error}", flush=True)
                    continue
                for key, value in translated.items():
                    digest = hashlib.sha256(templates_by_key[key].encode()).hexdigest()
                    for alias in aliases[digest]:
                        cache[alias] = {"templateSha256": digest, "translation": value}
                        resolved[alias] = value
                        provenance[alias] = "supplementary"
                atomic_json(cache_path, {"version": 1, "values": cache})
                if number % 10 == 0 or number == len(chunks):
                    print(f"{code}: {number}/{len(chunks)} batches", flush=True)
        if failures:
            failed_languages.append(code)
            reports.pop(code, None)
            print(f"{code}: {len(failures)} batches require repair; successful translations are cached", flush=True)
            continue
        context_review_hash = hashlib.sha256((ROOT / "scripts/reviewed-term-contexts.json").read_bytes()).hexdigest()
        native_format_hash = hashlib.sha256((ROOT / "scripts/reviewed-native-format-aliases.json").read_bytes()).hexdigest()
        native_locale_hash = hashlib.sha256((PACKS / (LANGUAGES[code].replace("_", "-").lower() + ".json")).read_bytes()).hexdigest()
        context_rules = [(re.compile(rule["sourcePattern"], re.I),
                          [(re.compile(pattern, re.I), replacement) for pattern, replacement in rule["languages"].get(code, [])])
                         for rule in read(ROOT / "scripts/reviewed-term-contexts.json")["rules"]]
        values = []
        context_repairs = 0
        native_display_overrides = set()
        for row in rows:
            if row["key"] in retained_keys:
                values.append(resolved[row["key"]])
                if row["english"] in retained_overrides:native_display_overrides.add(row["english"])
                continue
            if display_reviews.get(row["english"], {}).get(code) or row["key"] in prose_overrides:
                native_display_overrides.add(row["english"])
            value = resolved[row["key"]]
            if provenance[row["key"]] not in ("official", "reviewed"):
                if provenance[row["key"]] != "glossary":
                    repaired = replace_phrases(value)
                    phrase_repairs += repaired != value
                    value = repaired
                replacements = {}
                for i, term in enumerate(row["terms"]):
                    replacement = term["english"] if term["literal"] else from_glossary(term["english"], code)
                    if replacement is None:
                        raise ValueError(f"Missing protected game term {code}: {term['english']}")
                    replacements["{{EMTERM_" + str(i) + "}}"] = replacement
                value = restore_authored_terms(code, value, replacements,
                                               polish=provenance[row["key"]] != "glossary")
            # Some native labels contain untranslated English suffixes (for
            # example Korean trophy names ending in "Head"). Correct their
            # display spelling without modifying the archived native export.
            for _ in range(3):
                repaired = replace_phrases(value)
                if repaired == value:
                    break
                if provenance[row["key"]] == "official":
                    provenance[row["key"]] = "reviewed"
                    native_display_overrides.add(row["english"])
                phrase_repairs += 1
                value = repaired
            if provenance[row["key"]] != "official":
                before_context_review = value
                for source_pattern, replacements in context_rules:
                    if source_pattern.search(row["english"]):
                        for pattern, replacement in replacements:
                            value = pattern.sub(replacement, value)
                context_repairs += before_context_review != value
            if re.search(r"\{\{EMTERM_\d+\}\}", value):
                raise ValueError(f"Unresolved glossary token {code}:{row['key']}")
            values.append(value)
        atomic_json(OUT / f"{code.lower()}.json", {"version": 1, "sourceSha256": source_hash,
                    "phraseReviewSha256": phrase_review_hash, "values": values,
                    "contextReviewSha256": context_review_hash, "nativeFormatAliasSha256": native_format_hash,
                    "nativeLocaleSha256": native_locale_hash,
                    "nativeDisplayOverrides": sorted(native_display_overrides)})
        report = {"sourceSha256": source_hash, "strings": len(rows), "official": sum(v == "official" for v in provenance.values()),
                  "supplementary": sum(v == "supplementary" for v in provenance.values()), "glossaryComposed": sum(v == "glossary" for v in provenance.values()),
                  "reviewedLabels": sum(v == "reviewed" for v in provenance.values()), "missing": 0, "status": "translated-awaiting-review"}
        report["reviewedProse"] = sum(v == "reviewed-supplementary" for v in provenance.values())
        report["reviewedPhraseRepairs"] = phrase_repairs
        report["contextualTermRepairs"] = context_repairs
        report["phraseReviewSha256"] = phrase_review_hash
        reports[code] = report
        atomic_json(RESEARCH / "content-drafts" / f"{code}-report.json", report)
        provenance_codes = {"official": "O", "reviewed": "R", "reviewed-supplementary": "V", "supplementary": "S", "glossary": "G"}
        atomic_json(RESEARCH / "content-drafts" / f"{code.lower()}-provenance.json",
                    {"version": 1, "sourceSha256": source_hash,
                     "codes": "".join(provenance_codes[provenance[row["key"]]] for row in rows)})
        atomic_json(OUT / "manifest.json", {"version": 1, "sourceSha256": source_hash, "languages": reports})
        print(f"Completed {code}: {len(values)} display strings", flush=True)
    atomic_json(OUT / "manifest.json", {"version": 1, "sourceSha256": source_hash, "languages": reports})
    if failed_languages:
        raise RuntimeError("Incomplete language exports; successful caches retained: " + ", ".join(failed_languages))
    if args.sync_ui and len(reports) == len(LANGUAGES) - 1:
        subprocess.run([sys.executable, str(ROOT / "scripts/sync-app-game-terms.py")], check=True)


if __name__ == "__main__":
    main()
