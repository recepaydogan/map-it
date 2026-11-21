"""Read official Enshrouded language blobs without changing the game installation.

The cached collection is accepted only for its verified KFC SHA-256. Other
builds require --parser PATH (kfc-parser v0.2.0 or a compatible CLI). All language
blobs are parsed and validated before any public output is replaced.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "research/game-map-verification-2026-10-23"
LANGUAGES = json.loads((ROOT / "scripts/enshrouded-languages.json").read_text(encoding="utf-8"))


def read_table(data: bytes, field: int, stride: int) -> tuple[int, int]:
    if field < 0 or field + 8 > len(data):
        raise ValueError("Missing array header")
    relative, count = struct.unpack_from("<II", data, field)
    start = field + relative
    if start > len(data) or count * stride > len(data) - start:
        raise ValueError("Array extends beyond its source blob")
    return start, count


def parse_labels(data: bytes) -> dict[str, str]:
    start, count = read_table(data, 0, 24)
    labels: dict[str, str] = {}
    for i in range(count):
        pos = start + i * 24
        tag = str(struct.unpack_from("<I", data, pos)[0])
        relative, length = struct.unpack_from("<II", data, pos + 4)
        text_at = pos + 4 + relative
        if text_at > len(data) or length > len(data) - text_at:
            raise ValueError(f"Localization tag {tag} points outside the blob")
        if tag in labels:
            raise ValueError(f"Duplicate localization tag {tag}")
        labels[tag] = data[text_at:text_at + length].decode("utf-8")
    if not labels:
        raise ValueError("Empty language blob")
    return labels


def read_collection(index: bytes, index_hash: str, game: Path, parser: Path | None) -> dict:
    summary = json.loads((SNAPSHOT / "native-index-summary.json").read_text(encoding="utf-8"))
    if summary["indexSha256"] == index_hash:
        path = next((SNAPSHOT / "extracted/LocaTagCollectionResource").glob("*.json"))
        return json.loads(path.read_text(encoding="utf-8"))
    if parser is None or not parser.is_file():
        raise ValueError("This KFC build has no verified collection snapshot. Supply --parser PATH to decode its current LocaTagCollectionResource.")
    keys, count = read_table(index, 96, 32)
    resources = []
    for i in range(count):
        at = keys + i * 32
        if struct.unpack_from("<I", index, at + 16)[0] == 0x3F13FF35:
            resources.append(str(uuid.UUID(bytes_le=index[at:at + 16])) + "_3f13ff35_0")
    if len(resources) != 1:
        raise ValueError(f"Expected one localization collection, found {len(resources)}")
    process = subprocess.run([str(parser.resolve()), "unpack", "-g", str(game), "-s", "-f", resources[0]],
                             capture_output=True, check=True, encoding="utf-8")
    rows = [json.loads(line) for line in process.stdout.splitlines() if line.lstrip().startswith("{")]
    rows = [row for row in rows if row.get("$type") == "keen::LocaTagCollectionResource"]
    if len(rows) != 1:
        raise ValueError("Parser did not return exactly one localization collection")
    return rows[0]


def extract(game: Path, output: Path, parser: Path | None = None) -> dict:
    game = game.resolve()
    index_path = game / "enshrouded.kfc"
    if not index_path.is_file():
        raise FileNotFoundError(f"Game archive is missing: {index_path}. Supply --game-dir with the installed game folder.")
    index = index_path.read_bytes()
    if index[:4] != b"KFC4":
        raise ValueError("Expected a KFC4 index; no files were exported")
    index_hash = hashlib.sha256(index).hexdigest()
    collection = read_collection(index, index_hash, game, parser)
    keys_at, count = read_table(index, 72, 16)
    values_at, value_count = read_table(index, 80, 16)
    if count != value_count:
        raise ValueError("Blob key/value counts differ")
    positions: dict[bytes, int] = {}
    for i in range(count):
        key = index[keys_at + i * 16:keys_at + (i + 1) * 16]
        if key in positions:
            raise ValueError("Duplicate content-addressed blob key")
        positions[key] = i
    packs = {}
    blob_reports = {}
    known = set(LANGUAGES.values())
    for language in collection["languages"]:
        code = language["language"]
        if code not in known:
            raise ValueError(f"New game language {code}; update the explicit app-language mapping first")
        if code in packs:
            raise ValueError(f"Duplicate language {code}")
        h = language["data"]["hash"]
        key = struct.pack("<IIII", h["size"], h["hash0"], h["hash1"], h["hash2"])
        if key not in positions:
            raise ValueError(f"Missing content-addressed blob for {code}")
        entry = values_at + positions[key] * 16
        offset = struct.unpack_from("<I", index, entry)[0]
        container = struct.unpack_from("<H", index, entry + 6)[0]
        path = game / f"enshrouded_{container:03}.dat"
        with path.open("rb") as stream:
            stream.seek(offset)
            blob = stream.read(h["size"])
        if len(blob) != h["size"]:
            raise ValueError(f"Truncated language blob: {code}")
        packs[code] = parse_labels(blob)
        blob_reports[code] = {"file": path.name, "offset": offset, "bytes": len(blob),
                              "sha256": hashlib.sha256(blob).hexdigest(), "tagCount": len(packs[code])}
    missing_languages = known - packs.keys()
    if missing_languages:
        raise ValueError(f"Missing expected game languages: {sorted(missing_languages)}")
    source = packs["En_Us"]
    keys = sorted(source, key=int)
    source_hash = hashlib.sha256(json.dumps([keys, [source[k] for k in keys]], ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    manifest_path = game.parent.parent / "appmanifest_1203620.acf"
    manifest_text = manifest_path.read_text(encoding="utf-8") if manifest_path.is_file() else ""
    build = re.search(r'"buildid"\s+"(\d+)"', manifest_text)
    report = {"version": 1, "gameBuild": build.group(1) if build else None,
              "indexSha256": index_hash, "sourceTagCount": len(keys), "languages": {}}
    files = {"source.json": {"version": 1, "sourceSha256": source_hash, "keys": keys, "values": [source[k] for k in keys]}}
    for app_code, code in LANGUAGES.items():
        values = [packs[code].get(k) or None for k in keys]
        files[code.replace("_", "-").lower() + ".json"] = {"version": 1, "sourceSha256": source_hash, "values": values}
        report["languages"][app_code] = {"gameCode": code, **blob_reports[code],
                                         "missingSourceTags": sum(v is None for v in values),
                                         "extraTags": len(packs[code].keys() - source.keys())}
    files["manifest.json"] = report
    output = output.resolve()
    if output == game or game in output.parents:
        raise ValueError("Output must be outside the game installation")
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".locale-export-", dir=output.parent) as staging:
        staging = Path(staging)
        for name, value in files.items():
            (staging / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        # Manifest is replaced last and records provenance for every exported blob.
        for name in files:
            (staging / name).replace(output / name)
    return report


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--game-dir", type=Path, default=Path(r"C:\Program Files (x86)\Steam\steamapps\common\Enshrouded"))
    cli.add_argument("--output", type=Path, default=ROOT / "public/data/enshrouded/locales")
    cli.add_argument("--parser", type=Path)
    args = cli.parse_args()
    try:
        report = extract(args.game_dir, args.output, args.parser)
    except (ValueError, FileNotFoundError, subprocess.CalledProcessError) as error:
        cli.exit(2, str(error) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
