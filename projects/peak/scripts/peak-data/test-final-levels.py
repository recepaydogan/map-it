import runpy
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scan-peak-game-data.py"))
Scanner = module["GameDataScanner"]


class FinalLevelTests(unittest.TestCase):
    def derive(self, include_final):
        scanner = Scanner.__new__(Scanner)
        scanner.data_root = Path("game")
        scanner.script_ids = {1: "MapHandler", 2: "Peak.VoidBiome"}
        settings = SimpleNamespace(type=SimpleNamespace(name="BuildSettings"), read=lambda: SimpleNamespace(
            scenes=["Assets/WilIsland.unity", "Assets/Level_0.unity", "Assets/Level_1.unity"]))
        components = [SimpleNamespace(type=SimpleNamespace(name="MonoBehaviour"), get_raw_data=lambda: (0, 1))]
        if include_final:
            components.append(SimpleNamespace(type=SimpleNamespace(name="MonoBehaviour"), get_raw_data=lambda: (0, 2)))
        globals_ = Scanner.derive_levels.__globals__
        with patch.object(module["UnityPy"], "load", side_effect=[SimpleNamespace(objects=[settings]), SimpleNamespace(objects=components)]), patch.dict(globals_, {"mono_header": lambda data: data}):
            return scanner.derive_levels()

    def test_daily_handler_does_not_hide_final_subtree(self):
        daily, special = self.derive(True)
        self.assertEqual(len(daily), 2)
        self.assertEqual([level["scene"] for level in special], ["Level_0", "Level_1", "WilIsland"])
        self.assertTrue(all(level["captureRootComponent"] == "Peak.VoidBiome" for level in special))
        self.assertTrue(all(level["index"] is None for level in special))

    def test_missing_final_component_stops_release(self):
        with self.assertRaisesRegex(ValueError, "incomplete release"):
            self.derive(False)


if __name__ == "__main__":
    unittest.main()
