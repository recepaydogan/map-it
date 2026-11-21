"""Prepare app UI locales, reusing identical-context companion UI translations.

Only public, app-authored English strings are submitted to Google Translate.
Official game text is handled exclusively by extract-enshrouded-locales.py.
The generated report distinguishes reused strings, drafts and reviewed edits.
Use --reuse-root PATH to reuse sibling projects and --languages tr,de to resume.
"""
from __future__ import annotations

import argparse
import collections
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import json
from pathlib import Path
import re
import os
import threading
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "src/i18n/locales"
LANGUAGES = json.loads((ROOT / "scripts/enshrouded-languages.json").read_text(encoding="utf-8"))
TARGETS = {"zh-Hans": "zh-CN", "zh-Hant": "zh-TW"}
_request_lock = threading.Lock()
_next_request = 0.0
_cooldown_until = 0.0
_rate_limits = 0
REQUEST_INTERVAL = float(os.environ.get("ENSHROUDED_TRANSLATION_INTERVAL", "1.5"))
_rate_state_path = Path(tempfile.gettempdir()) / "enshrouded-localization-cache/rate-limit.json"
try:
    _rate_state = json.loads(_rate_state_path.read_text(encoding="utf-8"))
    _cooldown_until = time.monotonic() + max(0, _rate_state.get("until", 0) - time.time())
    _rate_limits = _rate_state.get("count", 0)
except (OSError, ValueError):
    pass


def save_rate_state(until, count):
    _rate_state_path.parent.mkdir(parents=True, exist_ok=True)
    _rate_state_path.write_text(json.dumps({"until": until, "count": count}), encoding="utf-8")


def request_slot():
    global _next_request
    while True:
        with _request_lock:
            now = time.monotonic()
            delay = max(_next_request, _cooldown_until) - now
            if delay <= 0:
                _next_request = now + REQUEST_INTERVAL
                return
        time.sleep(min(delay, 5))


def rate_limited(error):
    global _cooldown_until, _rate_limits
    with _request_lock:
        _rate_limits += 1
        try:
            retry_after = float(error.headers.get("Retry-After", "0"))
        except ValueError:
            retry_after = 0
        delay = max(retry_after, min(60 * 2 ** (_rate_limits - 1), 900))
        _cooldown_until = max(_cooldown_until, time.monotonic() + delay)
        save_rate_state(time.time() + delay, _rate_limits)
    print(f"Translation service rate limit; preserving work and waiting {delay:.0f}s before retry", flush=True)
PROTECTED = re.compile(r"\{\{.*?\}\}|Enshrouded Companion|Enshrouded|Overwolf|Discord|Keen Games|Ctrl\+Shift\+[A-Z]|you@example\.com")
CONTEXT = {
    "buildingGuide.nav": "Construction",
    "buildingGuide.title": "Construction guide",
    "buildingGuide.loading": "Loading construction guide…",
    "buildingGuide.collapseSidebar": "Collapse construction materials list",
    "buildingGuide.expandSidebar": "Expand construction materials list",
    "buildingGuide.groups.soil-and-dirt": "Soil and earth",
    "buildingGuide.craftTime": "Crafting time",
    "craftingGuide.craftTime": "Crafting time",
    "craftingGuide.openBuilding": "Open construction guide",
    "craftingGuide.craftedHere": "Produced here · {{count}} items",
    "progressionGuide.craftTime": "Crafting time",
    "progressionGuide.craftingRecipes_other": "{{count}} crafting recipes",
    "progressionGuide.searchCraftedItems": "Search produced items",
    "progressionGuide.recruitmentQuest": "Quest to recruit this character",
    "gameplayGuide.craftTime": "Crafting time",
    "gameplayGuide.regions": "Regions where this animal is found",
    "gameplayGuide.rods": "Fishing rods",
    "gameplayGuide.loot": "Fishing loot",
    "gameplayGuide.spotType": "Fishing spot type",
    "gameplayGuide.obtainedBy": "How to obtain",
    "gameplayGuide.unlockedBy": "Unlock requirement",
    "gameplayGuide.stepCast": "Hold the button to cast your fishing line, then wait for a catch.",
    "wikiGuide.craftTime": "Crafting time",
    "wikiGuide.obtainedBy": "How to obtain",
    "map.enshrouded.groups.Mine": "Mining site",
    "map.enshrouded.bestiary.boss": "Boss enemy",
    "map.enshrouded.bestiary.drops": "Loot drops",
    "chrome.restore": "Restore window",
    "buildingGuide.facts.set": "Collection",
    "craftingGuide.crafterAndWorkshops": "Craftsperson and workshops",
    "craftingGuide.manual": "Crafting by hand",
    "gameplayGuide.spots": "Fishing spots",
    "gameplayGuide.spotTypes_one": "{{count}} fishing spot type",
    "gameplayGuide.spotTypes_other": "{{count}} fishing spot types",
    "map.enshrouded.locationGuide.facts.spireReveal": "The Flame reveals Ancient Obelisk sites. Reading these obelisks reveals nearby locations containing a Shroud Root or a Flame Shrine.",
    "map.enshrouded.locationGuide.facts.obeliskReveal": "Reading an Ancient Obelisk can reveal nearby locations containing a Shroud Root or a Flame Shrine.",
    "map.enshrouded.locationGuide.facts.vaultSurvivor": "Some ancient crypts contain sleeping survivors. Each crypt has its own unlock quest and rewards.",
    "map.enshrouded.locationGuide.facts.shrineSparks": "Speak with the Flame to gather Spark items. These replenish over time, and their quantity varies by biome.",
    "map.enshrouded.locationGuide.facts.wellSkillPoints": "Completing an Elixir Well awards three skill points, once per character.",
    "map.enshrouded.locationGuide.facts.forgeUses": "A Gem Forge can socket, remove, upgrade and recycle weapon gems. These actions consume the Archaic Essence associated with its region.",
    "map.enshrouded.locationGuide.facts.caveVeins": "Underground cave passages may contain mineable veins and hazards. The deposits and dangers vary between passages.",
    "gameplayGuide.yields": "Harvest yield",
    "map.details.title": "NPC title",
    "map.details.completed": "Found",
    "map.markerStyle.icons.pin": "Map pin",
    "map.markerStyle.icons.home": "Home base",
    "progressionGuide.catalogs.sets": "Collections",
    "progressionGuide.setItems": "Collection items",
    "progressionGuide.setItem": "Collection item",
    "progressionGuide.relatedSets": "Related collections",
    "settings.fontSize": "Text size",
    "settings.hotkeyApp": "Show or hide the in-game app",
    "settings.hotkeyDesktopApp": "Show or hide the desktop app",
    "settings.hotkeyMinimap": "Show or hide the minimap",
    "onboarding.step_crafting_title": "Plan item crafting",
    "onboarding.step_sets_title": "Complete your equipment sets",
    "wikiGuide.groups.armor-cosmetic": "Cosmetic armor",
}


def flatten(value, path=()):
    if isinstance(value, dict):
        for k, v in value.items():
            yield from flatten(v, path + (k,))
    elif isinstance(value, list):
        for k, v in enumerate(value):
            yield from flatten(v, path + (str(k),))
    elif isinstance(value, str):
        yield ".".join(path), value


def set_value(root, key, value):
    path = key.split(".")
    for part in path[:-1]:
        root = root[int(part)] if isinstance(root, list) else root[part]
    if isinstance(root, list):
        root[int(path[-1])] = value
    else:
        root[path[-1]] = value


def placeholders(value):
    return sorted(re.findall(r"\{\{.*?\}\}", value))


def reusable(language, source, projects):
    by_key = {}
    by_text = collections.defaultdict(set)
    for project in projects:
        directory = project / "src/i18n/locales"
        english = directory / "en.json"
        target = directory / f"{language}.json"
        if not english.is_file() or not target.is_file() or project.resolve() == ROOT:
            continue
        a = dict(flatten(json.loads(english.read_text(encoding="utf-8"))))
        b = dict(flatten(json.loads(target.read_text(encoding="utf-8"))))
        for key, text in a.items():
            translated = b.get(key)
            if not translated or translated == text or placeholders(text) != placeholders(translated):
                continue
            if any(term in translated for term in ("AION", "Baldur", "Zomboid", "World of Warcraft", "Phantom Blade")):
                continue
            by_text[text].add(translated)
            if key in source and source[key] == text:
                by_key.setdefault(key, translated)
    # Cross-project English matches do not establish context. Reuse requires
    # the same UI key as well as the same English text.
    return {key: value for key, value in by_key.items() if key not in CONTEXT}


def translate_chunk(language, entries, hashed_markers=False):
    global _rate_limits
    fragments = []
    markers = []
    lines = []
    for i, (key, value) in enumerate(entries):
        protected = []
        marker_values = {}
        def mask(match):
            protected.append(match.group())
            marker = ("ZXQ" + hashlib.sha256((key + ":" + str(len(protected))).encode()).hexdigest()[:12].upper() + "QXZ") \
                if hashed_markers else f'ZXQTERM{len(protected) - 1:04d}QXZ'
            marker_values[marker] = match.group()
            return marker
        lines.append(f"__EM_{i:04d}__\n" + PROTECTED.sub(mask, CONTEXT.get(key, value)))
        fragments.append(protected)
        markers.append(marker_values)
    query = urllib.parse.urlencode({"client": "gtx", "sl": "en", "tl": TARGETS.get(language, language),
                                    "dt": "t", "q": "\n".join(lines)})
    error = None
    for attempt in range(4):
        try:
            request = urllib.request.Request("https://translate.googleapis.com/translate_a/single?" + query,
                                             headers={"User-Agent": "EnshroudedCompanionLocaleBuilder/1.0"})
            while True:
                request_slot()
                try:
                    with urllib.request.urlopen(request, timeout=35) as response:
                        payload = json.load(response)
                    with _request_lock:
                        _rate_limits = 0
                        save_rate_state(0, 0)
                    break
                except urllib.error.HTTPError as limit:
                    if limit.code != 429:
                        raise
                    rate_limited(limit)
            text = "".join(segment[0] or "" for segment in payload[0])
            matches = {int(m[1]): m[2].strip() for m in re.finditer(r"__EM_(\d{4})__\s*([\s\S]*?)(?=__EM_\d{4}__|$)", text)}
            if set(matches) != set(range(len(entries))):
                raise ValueError("Translation service did not preserve entry boundaries")
            result = {}
            for i, (key, original) in enumerate(entries):
                value = matches[i]
                for marker, fragment in markers[i].items():
                    value = re.sub(re.escape(marker), lambda match: fragment, value, flags=re.I)
                if placeholders(value) != placeholders(original) \
                    or collections.Counter(PROTECTED.findall(value)) != collections.Counter(markers[i].values()) \
                    or re.search(r"<x\b|__EM_|ZXQ|QXZ|\bZX[A-Z0-9 ]{5,50}QZ\b", value, flags=re.I):
                    raise ValueError(f"Invalid protected fragment in {language}:{key}: {value[:450]!r}")
                if not value:
                    raise ValueError(f"Empty translation in {language}:{key}")
                result[key] = value
            return result
        except Exception as exc:
            error = exc
            if isinstance(exc, ValueError):
                break
            if attempt < 3:
                time.sleep(2 ** attempt * 2)
    # Smaller requests also avoid silently accepting merged or damaged strings.
    if len(entries) > 1:
        middle = len(entries) // 2
        return {**translate_chunk(language, entries[:middle], hashed_markers), **translate_chunk(language, entries[middle:], hashed_markers)}
    if not hashed_markers:
        return translate_chunk(language, entries, hashed_markers=True)
    raise RuntimeError(f"Could not translate {language}:{entries[0][0]}") from error


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--reuse-root", type=Path)
    cli.add_argument("--languages", default=",".join(k for k in LANGUAGES if k != "en"))
    args = cli.parse_args()
    source_tree = json.loads((LOCALES / "en.json").read_text(encoding="utf-8"))
    source = dict(flatten(source_tree))
    source_hash = hashlib.sha256((LOCALES / "en.json").read_bytes()).hexdigest()
    projects = sorted(args.reuse_root.iterdir()) if args.reuse_root else []
    cache_dir = ROOT / "research/localization/app-drafts"
    cache_dir.mkdir(parents=True, exist_ok=True)
    for language in args.languages.split(","):
        if language == "en" or language not in LANGUAGES:
            raise ValueError(f"Unsupported target language {language}")
        target = copy.deepcopy(source_tree)
        values = reusable(language, source, projects)
        reused = len(values)
        cache_path = cache_dir / f"{language.lower()}.json"
        cached = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.is_file() else {}
        cache = cached.get("values", {}) if cached.get("sourceSha256") == source_hash else {}
        old_context = cached.get("context", {})
        cache = {key: value for key, value in cache.items()
                 if old_context.get(key) == CONTEXT.get(key)}
        values.update(cache)
        # Technical literals and brands do not need translation.
        for key, value in source.items():
            if not re.search(r"[A-Za-z]", PROTECTED.sub("", value)):
                values[key] = value
        pending = [(k, v) for k, v in source.items() if k not in values]
        chunks = []
        current = []
        size = 0
        for entry in pending:
            if current and (size + len(entry[1]) > 2600 or len(current) >= 24):
                chunks.append(current)
                current = []
                size = 0
            current.append(entry)
            size += len(entry[1]) + 30
        if current:
            chunks.append(current)
        with ThreadPoolExecutor(max_workers=2) as pool:
            for number, translated in enumerate(pool.map(lambda rows: translate_chunk(language, rows), chunks), 1):
                cache.update(translated)
                values.update(translated)
                cache_path.write_text(json.dumps({"sourceSha256": source_hash, "context": CONTEXT, "values": cache}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(f"{language}: {number}/{len(chunks)} batches", flush=True)
        overrides_path = ROOT / "scripts/localization-overrides" / f"{language.lower()}.json"
        overrides = json.loads(overrides_path.read_text(encoding="utf-8")) if overrides_path.is_file() else {}
        values.update(overrides)
        for key, original in source.items():
            value = values[key]
            if placeholders(value) != placeholders(original):
                raise ValueError(f"Placeholder mismatch: {language}:{key}")
            set_value(target, key, value)
        # Counted Slavonic nouns need their own CLDR branches; reviewed forms
        # must be supplied instead of copying English plural grammar.
        extra = {key: value for key, value in overrides.items() if key not in source}
        for key, value in extra.items():
            set_value(target, key, value)
        # i18next v4 expects an explicit _one branch; older app copy used an
        # unsuffixed singular for matchCount. Romance _many uses the regular
        # plural wording. Slavonic _few/_many require reviewed forms instead.
        plural_bases = {key[:-6] for key in source if key.endswith("_other")}
        flat_target = dict(flatten(target))
        for base in plural_bases:
            if base + "_one" not in flat_target and base in flat_target:
                set_value(target, base + "_one", flat_target[base])
            if language in ("fr", "it", "es", "pt-BR"):
                set_value(target, base + "_many", flat_target[base + "_other"])
        path = LOCALES / f"{language.lower()}.json"
        path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report = {"language": language, "sourceSha256": source_hash, "sourceStrings": len(source),
                  "reused": reused, "machineDrafted": len(cache), "reviewedOverrides": len(overrides),
                  "missingKeys": [], "status": "draft"}
        (cache_dir / f"{language.lower()}-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Prepared {language}: {len(source)} strings, {reused} reused, {len(cache)} drafted", flush=True)


if __name__ == "__main__":
    main()
