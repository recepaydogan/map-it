"""Resolve game terms in UI copy using the installed official dictionaries."""
import hashlib
import argparse
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("content_builder", ROOT / "scripts/build-content-locales.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
translator = builder.translator


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--offline-only", action="store_true", help="Apply native terms and valid cached prose without requesting translations")
    args = cli.parse_args()
    import subprocess
    subprocess.run(["node", str(ROOT / "scripts/normalize-locale-filenames.mjs")], check=True)
    subprocess.run(["node", str(ROOT / "scripts/apply-reviewed-content-labels.mjs")], check=True)
    official = builder.read(builder.PACKS / "source.json")
    by_english = {}
    for i, value in enumerate(official["values"]):
        if value:
            by_english.setdefault(builder.normalize(value), []).append(i)
    index_by_tag = {tag: i for i, tag in enumerate(official["keys"])}
    glossary = builder.read(builder.RESEARCH / "content-translation-source.json")["glossaryTerms"]
    reviewed_labels = builder.read(ROOT / "scripts/reviewed-content-labels.json")
    pattern = re.compile(r"(?<![\w])(?:" + "|".join(re.escape(term) for term in glossary) + r")(?![\w])")
    english = dict(translator.flatten(builder.read(translator.LOCALES / "en.json")))
    cache_dir = builder.RESEARCH / "ui-game-terms"
    cache_dir.mkdir(parents=True, exist_ok=True)
    for code, game_code in builder.LANGUAGES.items():
        if code == "en":
            continue
        pack = builder.read(builder.PACKS / (game_code.replace("_", "-").lower() + ".json"))["values"]
        def game_text(value):
            # These faction tags have unrelated "Raw Soil" translations on
            # other native records. Use the verified faction labels explicitly.
            faction_tag = {"Vukah": "388130378", "Drak": "3175261909"}.get(value)
            if faction_tag:
                return builder.plain(pack[index_by_tag[faction_tag]])
            if value in builder.DERIVED_GAME_TERMS:
                return builder.derived_game_text(value, official, pack, index_by_tag)
            canonical = builder.NATIVE_LABEL_ALIASES.get(value, value)
            candidates = [index_by_tag[builder.TAG_OVERRIDES[canonical]]] if canonical in builder.TAG_OVERRIDES else by_english.get(builder.normalize(canonical), [])
            values = {builder.plain(pack[i]) for i in candidates if pack[i]}
            return next(iter(values)) if len(values) == 1 else reviewed_labels.get(value, {}).get("translations", {}).get(code)
        target = builder.read(translator.LOCALES / f"{code.lower()}.json")
        current = dict(translator.flatten(target))
        cache_path = cache_dir / f"{code.lower()}.json"
        cache = builder.read(cache_path) if cache_path.is_file() else {}
        pending = []
        rows = {}
        resolved = {}
        for key, source in english.items():
            terms = []
            literal_tokens = []
            def literal(match):
                literal_tokens.append(match.group())
                return "{{EMLITERAL_" + str(len(literal_tokens) - 1) + "}}"
            template = re.sub(r"\{\{.*?\}\}", literal, translator.CONTEXT.get(key, source))
            def mask(match):
                terms.append(match.group())
                return "{{EMUITERM_" + str(len(terms) - 1) + "}}"
            template = pattern.sub(mask, template)
            template = re.sub(r"Enshrouded(?: Companion)?|Overwolf|Discord", literal, template)
            direct = game_text(source) if key.startswith("map.enshrouded.groups.") or key.startswith("map.enshrouded.bestiary.factions.") \
                or key in ("map.enshrouded.categoryGroups.lore", "map.enshrouded.categoryGroups.resources", "map.enshrouded.categoryGroups.collectibles") else None
            if direct:
                resolved[key] = direct
                continue
            if not terms and key in current and key not in translator.CONTEXT:
                continue
            digest = hashlib.sha256(template.encode()).hexdigest()
            rows[key] = {"template": template, "terms": terms, "literals": literal_tokens, "sha256": digest}
            if cache.get(key, {}).get("sha256") == digest:
                resolved[key] = cache[key]["translation"]
            else:
                pending.append(("ui:" + key, template))
        for start in range(0, 0 if args.offline_only else len(pending), 18):
            translated = translator.translate_chunk(code, pending[start:start + 18])
            for key, value in translated.items():
                key = key.removeprefix("ui:")
                cache[key] = {"sha256": rows[key]["sha256"], "translation": value}
                resolved[key] = value
            builder.atomic_json(cache_path, cache)
        for key, value in resolved.items():
            if key in rows:
                row = rows[key]
                replacements = {}
                for i, term in enumerate(row["terms"]):
                    translated = game_text(term)
                    if not translated:
                        raise ValueError(f"Missing UI glossary term {code}:{term}")
                    replacements["{{EMUITERM_" + str(i) + "}}"] = translated
                for i, literal in enumerate(row["literals"]):
                    replacements["{{EMLITERAL_" + str(i) + "}}"] = literal
                value = builder.restore_authored_terms(code, value, replacements)
            if translator.placeholders(value) != translator.placeholders(english[key]):
                raise ValueError(f"UI interpolation mismatch {code}:{key}")
            translator.set_value(target, key, value)
        # Faction group names use a neutral separator instead of guessing the
        # grammatical inflection of proper names supplied by the game.
        bosses = {"de": "Bosse", "fr": "Boss", "it": "Boss", "es": "Jefes", "ru": "Боссы", "pl": "Bossowie", "ja": "ボス", "ko": "보스", "pt-BR": "Chefes", "th": "บอส", "tr": "Boss'lar", "zh-Hans": "首领", "zh-Hant": "首領", "uk": "Боси"}
        enemies = {"de": "Gegner", "fr": "Ennemis", "it": "Nemici", "es": "Enemigos", "ru": "Враги", "pl": "Wrogowie", "ja": "敵", "ko": "적", "pt-BR": "Inimigos", "th": "ศัตรู", "tr": "Düşmanlar", "zh-Hans": "敌人", "zh-Hant": "敵人", "uk": "Вороги"}
        for faction in ("Fell", "Scavengers", "Vukah", "Hollow", "Drak"):
            prefix = "scavenger" if faction == "Scavengers" else faction.lower()
            for suffix, label in (("Bosses", bosses[code]), ("Enemies", enemies[code])):
                key = f"map.enshrouded.bestiary.groups.{prefix}{suffix}"
                if key in english:
                    translator.set_value(target, key, f"{game_text(faction)} · {label}")
        for key in ("map.enshrouded.bestiary.bosses", "map.categories.boss", "map.categoryGroups.enemies"):
            if key in english:
                translator.set_value(target, key, enemies[code] if key.endswith("enemies") else bosses[code])
        translator.set_value(target, "map.enshrouded.categoryGroups.shroud", f"{game_text('Shroud')} · {game_text('Flame')}")
        if english.get("map.enshrouded.groups.Music_Sheet") == "Music Sheet":
            native_sheets = game_text("Music Sheets")
            if native_sheets:
                translator.set_value(target, "map.enshrouded.groups.Music_Sheet", native_sheets)
        # Reviewed app context takes precedence over an unrelated native label
        # with the same English spelling (Type as an action versus an item type).
        overrides_path = ROOT / "scripts/localization-overrides" / f"{code.lower()}.json"
        overrides = builder.read(overrides_path) if overrides_path.is_file() else {}
        for key, value in overrides.items():
            source = english.get(key, english.get(re.sub(r"_(?:one|two|zero|few|many)$", "_other", key)))
            if source is None or translator.placeholders(value) != translator.placeholders(source):
                raise ValueError(f"Invalid reviewed UI context: {code}:{key}")
            translator.set_value(target, key, value)
        builder.atomic_json(translator.LOCALES / f"{code.lower()}.json", target)
        print(f"{code}: synchronized {len(resolved)} UI labels and sentences with official terminology"
              + (f"; {len(pending)} uncached messages still pending" if args.offline_only else ""), flush=True)
    subprocess.run(["node", str(ROOT / "scripts/apply-reviewed-ui-count-labels.mjs")], check=True)


if __name__ == "__main__":
    main()
