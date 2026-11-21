import runpy
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scan-peak-game-data.py"))
Scanner = module["GameDataScanner"]


class PackedAssetTests(unittest.TestCase):
    def test_only_bounded_tail_rotation_changes_are_allowed(self):
        entries = [{'index': i, 'scene': f'Level_{i}', 'assetFile': f'level{i + 5}'} for i in range(25)]
        Scanner.validate_rotation_extension(entries[:21], entries, [21,22,23,24,0,1,2])
        with self.assertRaisesRegex(ValueError, 'outside'):
            Scanner.validate_rotation_extension(entries[:21], entries, list(range(7)))
        Scanner.validate_rotation_extension(entries, entries[:21], list(range(7)))
        shortened_and_rebound = [dict(x) for x in entries[:21]]
        shortened_and_rebound[0]['assetFile'] = 'level99'
        with self.assertRaisesRegex(ValueError, 'reordered or rebound'):
            Scanner.validate_rotation_extension(entries, shortened_and_rebound, list(range(7)))
        changed = [dict(x) for x in entries]
        changed[0]['assetFile'] = 'level99'
        with self.assertRaisesRegex(ValueError, 'reordered or rebound'):
            Scanner.validate_rotation_extension(entries[:21], changed, [21,22,23,24,0,1,2])

    def test_packed_lookup_is_scoped_to_one_file(self):
        scanner = Scanner.__new__(Scanner)
        scanner.bundle_environment = object()
        first, second = object(), object()
        scanner.bundle_files = {
            "level5": SimpleNamespace(objects={1: first}),
            "level6": SimpleNamespace(objects={1: second}),
        }
        self.assertEqual(scanner.load_asset("level5").objects, [first])
        self.assertEqual(scanner.load_asset("level6").objects, [second])

    def test_missing_packed_asset_fails_closed(self):
        scanner = Scanner.__new__(Scanner)
        scanner.bundle_environment = object()
        scanner.bundle_files = {}
        with self.assertRaisesRegex(ValueError, "Required asset is missing"):
            scanner.load_asset("resources.assets")

    def test_loose_asset_loading_is_preserved(self):
        scanner = Scanner.__new__(Scanner)
        scanner.data_root = Path("game")
        expected = object()
        with patch.object(module["UnityPy"], "load", return_value=expected) as loader:
            self.assertIs(scanner.load_asset("level5"), expected)
            loader.assert_called_once_with(str(Path("game") / "level5"))


if __name__ == "__main__":
    unittest.main()
