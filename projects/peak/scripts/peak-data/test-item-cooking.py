"""Regression checks for the game's runtime campfire eligibility rules."""
import runpy
import struct
import unittest
from pathlib import Path
from types import SimpleNamespace

from UnityPy.helpers.TypeTreeNode import TypeTreeNode

can_cook = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scan-peak-game-data.py"))["item_can_be_cooked"]


class ItemCookingTests(unittest.TestCase):
    def setUp(self):
        self.nodes = TypeTreeNode.from_list([
            {"m_Level": 0, "m_Type": "ItemCooking", "m_Name": "Base", "m_ByteSize": -1, "m_MetaFlag": 0, "m_Version": 1},
            {"m_Level": 1, "m_Type": "int", "m_Name": "preCooked", "m_ByteSize": 4, "m_MetaFlag": 0, "m_Version": 1},
            {"m_Level": 1, "m_Type": "bool", "m_Name": "disableCooking", "m_ByteSize": 1, "m_MetaFlag": 0, "m_Version": 1},
            {"m_Level": 1, "m_Type": "unknown-behavior", "m_Name": "references", "m_ByteSize": -1, "m_MetaFlag": 0, "m_Version": 1},
        ])

    def component(self, disabled):
        return SimpleNamespace(assets_file=None, get_raw_data=lambda: struct.pack("<i?", 0, disabled))

    def test_missing_component_uses_runtime_default(self):
        # Yellow Crispberry and both coconut prefabs rely on Item.Awake.
        self.assertTrue(can_cook(None))

    def test_explicitly_disabled_component_is_not_cookable(self):
        self.assertFalse(can_cook(self.component(True), self.nodes))

    def test_enabled_component_does_not_require_behavior_reference_types(self):
        self.assertTrue(can_cook(self.component(False), self.nodes))

    def test_missing_eligibility_field_fails_instead_of_guessing(self):
        self.nodes.m_Children = self.nodes.m_Children[:1]
        with self.assertRaisesRegex(ValueError, "missing disableCooking"):
            can_cook(self.component(False), self.nodes)


if __name__ == "__main__":
    unittest.main()
