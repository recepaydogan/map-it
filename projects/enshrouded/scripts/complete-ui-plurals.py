"""Translate counted UI messages using concrete CLDR examples, then restore count.

Existing reviewed plural families are preserved. New messages are staged until
all languages succeed and the original locale files are still unchanged.
Run after the content builder finishes, before final terminology sync and QA.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("content_builder", ROOT / "scripts/build-content-locales.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
translator = builder.translator

SINGULAR = {
    "buildingGuide.subtitle": "{{count}} building or terrain material, with linked recipes",
    "buildingGuide.results": "{{count}} entry",
    "buildingGuide.mapLocations": "{{count}} map location",
    "buildingGuide.moreLocations": "{{count}} more location on the map",
    "buildingGuide.showAllLocations": "Show {{count}} location",
    "craftingGuide.results": "{{count}} entry",
    "craftingGuide.showAll": "Show {{count}} item",
    "progressionGuide.results": "{{count}} entry",
    "progressionGuide.showAll": "Show {{count}} row",
    "itemsGuide.subtitle": "{{count}} item",
    "itemsGuide.results": "{{count}} item",
    "wikiGuide.subtitle": "{{count}} linked entry",
    "wikiGuide.results": "{{count}} entry",
    "gameplayGuide.results": "{{count}} entry",
    "map.clusterCategory": "{{category}} group with {{count}} location",
    "map.questGroup.description": "{{count}} quest is nearby.",
    "map.questGroup.markerLabel": "{{count}} quest here",
    "map.saved.count": "{{count}} place",
    "map.saved.gatheringDescription": "Plan a route to your {{count}} personal resource marker.",
    "support.inboxCount": "{{count}} report",
    "onboarding.step_welcome_body": "Explore the map and linked Enshrouded guides in {{count}} quick step.",
    "reference.entryCount": "{{count}} entry",
}
# Verified cardinal examples for every language currently shipped by the game.
SAMPLES = {
    "en": {"one": 1, "other": 2}, "de": {"one": 1, "other": 2},
    "fr": {"one": 1, "many": 1000000, "other": 2},
    "it": {"one": 1, "many": 1000000, "other": 2},
    "es": {"one": 1, "many": 1000000, "other": 2},
    "pt-BR": {"one": 1, "many": 1000000, "other": 2},
    "ru": {"one": 1, "few": 2, "many": 5, "other": 1.5},
    "pl": {"one": 1, "few": 2, "many": 5, "other": 1.5},
    "uk": {"one": 1, "few": 2, "many": 5, "other": 1.5},
    "tr": {"one": 1, "other": 2}, "ja": {"other": 2}, "ko": {"other": 2},
    "th": {"other": 2}, "zh-Hans": {"other": 2}, "zh-Hant": {"other": 2},
}


def restore_count(value, count):
    matches = []
    for match in re.finditer(r"(?<![0-9A-Za-z.,])\d+(?:[.,\u00a0\u202f ]\d+)*", value):
        digits = re.sub(r"[\s\u00a0\u202f]", "", match.group())
        normalized = digits.replace(",", ".") if count % 1 else re.sub(r"[.,]", "", digits)
        try:
            if float(normalized) == count:
                matches.append(match)
        except ValueError:
            continue
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one preserved count {count}: {value!r}")
    match = matches[0]
    return value[:match.start()] + "{{count}}" + value[match.end():]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--prepare-only", action="store_true")
    args = cli.parse_args()
    locale_paths = {code: translator.LOCALES / f"{code.lower()}.json" for code in builder.LANGUAGES}
    originals = {code: path.read_bytes() for code, path in locale_paths.items()}
    locales = {code: json.loads(value) for code, value in originals.items()}
    english = dict(translator.flatten(locales["en"]))
    for key, singular in SINGULAR.items():
        if "{{count}}" not in english.get(key, ""):
            raise ValueError(f"Missing counted source message: {key}")
        if translator.placeholders(singular) != translator.placeholders(english[key]):
            raise ValueError(f"Singular interpolation mismatch: {key}")
    print(f"Prepared {len(SINGULAR)} new counted message families in {len(locales)} languages", flush=True)
    if args.prepare_only:
        return
    cache_dir = Path(tempfile.gettempdir()) / "enshrouded-localization-cache/ui-plurals"
    report = {"version": 1, "families": list(SINGULAR), "languages": {}}
    for code, locale in locales.items():
        drafts = []
        for key, singular in SINGULAR.items():
            for form, count in SAMPLES[code].items():
                # Romance million-cardinal branches use the same plural noun
                # form as two. Translating the numeric example two prevents
                # the service from spelling out "one million" and losing the
                # count interpolation while retaining the correct grammar.
                if form == "many" and code in ("fr", "it", "es", "pt-BR"):
                    count = 2
                source = singular if count == 1 else english[key]
                drafts.append((f"{key}_{form}", source, count, source.replace("{{count}}", str(count))))
        if code == "en":
            for key, source, _, _ in drafts:
                translator.set_value(locale, key, source)
            continue
        cache_path = cache_dir / f"{code.lower()}.json"
        cache = builder.read(cache_path) if cache_path.is_file() else {}
        reviewed = builder.read(ROOT / "scripts/reviewed-ui-plural-messages.json").get(code, {})
        app_reviews = builder.read(ROOT / "scripts/localization-overrides" / f"{code.lower()}.json")
        for key, value in app_reviews.items():
            if re.sub(r"_(?:zero|one|two|few|many|other)$", "", key) in SINGULAR:
                reviewed[key] = value
        pending = {}
        for key, _, _, request in drafts:
            if key in reviewed:
                continue
            digest = hashlib.sha256(request.encode()).hexdigest()
            if digest not in cache:
                pending[digest] = request
        entries = [("plural:" + key, value) for key, value in pending.items()]
        for start in range(0, len(entries), 16):
            values = translator.translate_chunk(code, entries[start:start + 16])
            cache.update({key.removeprefix("plural:"): value for key, value in values.items()})
            builder.atomic_json(cache_path, cache)
        for key, source, count, request in drafts:
            value = reviewed.get(key)
            if value is None:
                value = restore_count(cache[hashlib.sha256(request.encode()).hexdigest()], count)
            if translator.placeholders(value) != translator.placeholders(source):
                raise ValueError(f"Changed plural interpolation: {code}:{key}")
            translator.set_value(locale, key, value)
        # Keep JSON key parity for English plural branches that the target
        # language never selects. Its own "other" message is grammatical for
        # those counts too; i18next still selects the locale's CLDR branch.
        for base in SINGULAR:
            flat = dict(translator.flatten(locale))
            for form in ("one", "other"):
                if f"{base}_{form}" not in flat:
                    translator.set_value(locale, f"{base}_{form}", flat[f"{base}_other"])
        report["languages"][code] = {"forms": len(drafts), "status": "translated-awaiting-rendered-review"}
        builder.atomic_json(builder.RESEARCH / "ui-plurals" / f"{code.lower()}.json", locale)
        print(f"{code}: staged {len(drafts)} counted messages", flush=True)
    # Preserve any edits made by the user or the terminology synchronizer while
    # translation was in progress. The translation cache can be resumed safely.
    for code, path in locale_paths.items():
        if path.read_bytes() != originals[code]:
            raise RuntimeError(f"Locale changed while preparing plural messages: {code}; rerun using the retained cache")
    for code, locale in locales.items():
        builder.atomic_json(locale_paths[code], locale)
    builder.atomic_json(builder.RESEARCH / "ui-plurals/report.json", report)
    print("Applied complete counted messages in all 15 languages", flush=True)


if __name__ == "__main__":
    main()
