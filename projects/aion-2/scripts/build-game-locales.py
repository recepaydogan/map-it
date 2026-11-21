"""Pack decoded game localization tables for lazy loading by the app."""

import argparse
import hashlib
import json
from pathlib import Path


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decoded", type=Path, help="Directory containing L10N-<locale>.json exports")
    parser.add_argument("--output", type=Path, default=Path("public/data/game-locales"))
    parser.add_argument("--base-locale", default="en-US")
    args = parser.parse_args()

    translations = {}
    hashes = {}
    namespace = None
    for path in sorted(args.decoded.glob("L10N-*.json")):
        locale = path.stem.removeprefix("L10N-")
        raw = path.read_bytes()
        data = json.loads(raw)
        if not isinstance(data.get("Namespace"), str) or not isinstance(data.get("Entries"), dict):
            raise ValueError(f"Unexpected localization export: {path}")
        if namespace is not None and data["Namespace"] != namespace:
            raise ValueError(f"Localization namespace differs: {path}")
        namespace = data["Namespace"]
        entries = data["Entries"]
        if not all(isinstance(key, str) and isinstance(value, str) for key, value in entries.items()):
            raise ValueError(f"Invalid localization entries: {path}")
        translations[locale] = entries
        hashes[locale] = hashlib.sha256(raw).hexdigest()

    if args.base_locale not in translations:
        raise ValueError(f"Base locale {args.base_locale} is missing")
    keys = sorted(set().union(*(set(entries) for entries in translations.values())))
    english = translations[args.base_locale]
    args.output.mkdir(parents=True, exist_ok=True)
    write_json(args.output / "source.json", {
        "version": 1,
        "keys": keys,
        "values": [english.get(key) for key in keys],
    })
    for locale in translations:
        if locale == args.base_locale:
            continue
        entries = translations[locale]
        write_json(args.output / f"{locale}.json", {
            "version": 1,
            "values": [entries.get(key) for key in keys],
        })
    write_json(args.output / "manifest.json", {
        "version": 1,
        "entries": len(keys),
        "locales": {locale: {"entries": len(translations[locale]), "sha256": hashes[locale]} for locale in translations},
    })
    print(f"Packed {len(keys)} localization keys for {len(translations)} languages in {args.output}")


if __name__ == "__main__":
    main()
