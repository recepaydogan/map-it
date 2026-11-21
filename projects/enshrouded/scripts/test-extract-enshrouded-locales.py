"""Exercise the KFC locale reader against bounded, synthetic game archives."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("extract_locales", Path(__file__).with_name("extract-enshrouded-locales.py"))
extractor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extractor)


def labels_blob(rows):
    blob = bytearray(8 + len(rows) * 24)
    struct.pack_into("<II", blob, 0, 8, len(rows))
    for i, (tag, text) in enumerate(rows):
        encoded = text.encode("utf-8")
        pos = 8 + i * 24
        struct.pack_into("<III", blob, pos, tag, len(blob) - pos - 4, len(encoded))
        blob.extend(encoded)
    return bytes(blob)


class LocaleExtractionTests(unittest.TestCase):
    def test_unicode_and_relative_offsets(self):
        self.assertEqual(extractor.parse_labels(labels_blob([(8, "Örs"), (3, "鍛冶台"), (99, "")])),
                         {"8": "Örs", "3": "鍛冶台", "99": ""})

    def test_rejects_duplicate_tags(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            extractor.parse_labels(labels_blob([(1, "one"), (1, "two")]))

    def test_rejects_truncated_text_and_array(self):
        with self.assertRaises(ValueError):
            extractor.parse_labels(labels_blob([(1, "hello")])[:-1])
        with self.assertRaises(ValueError):
            extractor.parse_labels(struct.pack("<II", 8, 1))

    def test_missing_archive_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "output"
            with self.assertRaises(FileNotFoundError):
                extractor.extract(Path(directory), target)
            self.assertFalse(target.exists())

    def test_all_languages_aligned_to_english_tags(self):
        with tempfile.TemporaryDirectory() as directory:
            game = Path(directory) / "game"
            game.mkdir()
            output = Path(directory) / "output"
            codes = list(extractor.LANGUAGES.values())
            count = len(codes)
            keys_at = 160
            values_at = keys_at + count * 16
            index = bytearray(values_at + count * 16)
            index[:4] = b"KFC4"
            struct.pack_into("<II", index, 72, keys_at - 72, count)
            struct.pack_into("<II", index, 80, values_at - 80, count)
            container = bytearray()
            collection = {"languages": []}
            for i, code in enumerate(codes):
                rows = [(9, "Name"), (2, "Description")] if code == "En_Us" else [(9, "Örs"), (10, "Extra")]
                blob = labels_blob(rows)
                key = (len(blob), i, 0, 0)
                struct.pack_into("<IIII", index, keys_at + i * 16, *key)
                struct.pack_into("<I", index, values_at + i * 16, len(container))
                struct.pack_into("<H", index, values_at + i * 16 + 6, 0)
                container.extend(blob)
                collection["languages"].append({"language": code, "data": {"hash": dict(zip(("size", "hash0", "hash1", "hash2"), key))}})
            (game / "enshrouded.kfc").write_bytes(index)
            (game / "enshrouded_000.dat").write_bytes(container)
            with patch.object(extractor, "read_collection", return_value=collection):
                report = extractor.extract(game, output)
            source = json.loads((output / "source.json").read_text(encoding="utf-8"))
            turkish = json.loads((output / "tr-tr.json").read_text(encoding="utf-8"))
            self.assertEqual(source["keys"], ["2", "9"])
            self.assertEqual(source["values"], ["Description", "Name"])
            self.assertEqual(turkish["values"], [None, "Örs"])
            self.assertEqual(len(report["languages"]), 15)
            self.assertEqual(report["languages"]["tr"]["missingSourceTags"], 1)
            self.assertEqual(report["languages"]["tr"]["extraTags"], 1)
            # A missing final archive never replaces a previously valid export.
            (game / "enshrouded_000.dat").unlink()
            before = (output / "manifest.json").read_bytes()
            with patch.object(extractor, "read_collection", return_value=collection):
                with self.assertRaises(FileNotFoundError):
                    extractor.extract(game, output)
            self.assertEqual(before, (output / "manifest.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
