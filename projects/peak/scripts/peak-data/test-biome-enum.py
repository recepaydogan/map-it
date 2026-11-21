import runpy
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import dnfile


module = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scan-peak-game-data.py")
)
read_biome_type_names = module["read_biome_type_names"]
derive_official_biome_route = module["derive_official_biome_route"]


def fake_assembly(values):
    fields = [SimpleNamespace(Name=name) for _, name in values]
    constants = [
        SimpleNamespace(
            Parent=SimpleNamespace(row=field),
            Value=SimpleNamespace(value=value.to_bytes(4, "little", signed=True)),
        )
        for (value, _), field in zip(values, fields)
    ]
    definition = SimpleNamespace(
        TypeName="BiomeType",
        FieldList=[SimpleNamespace(row=field) for field in fields],
    )
    return SimpleNamespace(
        net=SimpleNamespace(mdtables=SimpleNamespace(TypeDef=[definition], Constant=constants)),
        close=Mock(),
    )


class BiomeEnumTests(unittest.TestCase):
    def test_sparse_values_are_not_replaced_by_list_positions(self):
        assembly = fake_assembly([(0, "Shore"), (3, "Volcano"), (5, "Peak"), (6, "Mesa"), (8, "Swamp")])
        with patch.object(dnfile, "dnPE", return_value=assembly):
            names = read_biome_type_names(Path("Assembly-CSharp.dll"))
        self.assertNotIn(4, names)
        self.assertEqual(names[6], "Mesa")
        self.assertEqual(names[8], "Swamp")
        assembly.close.assert_called_once()

    def test_changed_values_are_read_from_the_assembly(self):
        assembly = fake_assembly([(0, "Shore"), (42, "Mesa")])
        with patch.object(dnfile, "dnPE", return_value=assembly):
            self.assertEqual(read_biome_type_names(Path("game.dll"))[42], "Mesa")

    def test_invalid_enum_fails_closed_and_releases_the_file(self):
        assembly = fake_assembly([(0, "Unexpected")])
        with patch.object(dnfile, "dnPE", return_value=assembly):
            with self.assertRaises(ValueError):
                read_biome_type_names(Path("game.dll"))
        assembly.close.assert_called_once()


class OfficialBiomeRouteTests(unittest.TestCase):
    BIOME_NAMES = {
        0: "Shore",
        1: "Tropics",
        2: "Alpine",
        3: "Volcano",
        6: "Mesa",
        7: "Roots",
        8: "Swamp",
    }

    @staticmethod
    def map_handler(selected):
        return {
            "biomes": selected,
            "segments": [
                {"_biome": 0, "hasVariant": 0, "variantBiomeIndex": 0},
                {"_biome": 1, "hasVariant": 1, "variantBiomeIndex": 1},
                {"_biome": 2, "hasVariant": 1, "variantBiomeIndex": 0},
                {"_biome": 3, "hasVariant": 1, "variantBiomeIndex": 2},
                {"_biome": 3, "hasVariant": 1, "variantBiomeIndex": 3},
            ],
            "variantSegments": [
                {"_biome": 6},
                {"_biome": 7},
                {"_biome": 8},
                {"_biome": 8},
            ],
        }

    def test_caldera_route_includes_the_kiln_with_official_names(self):
        route = derive_official_biome_route(
            self.map_handler([0, 1, 2, 3]),
            self.BIOME_NAMES,
        )
        self.assertEqual(route, ["Shore", "Tropics", "Alpine", "Caldera", "The Kiln"])

    def test_gloom_route_includes_the_citadel_with_official_names(self):
        route = derive_official_biome_route(
            self.map_handler([0, 7, 6, 8]),
            self.BIOME_NAMES,
        )
        self.assertEqual(route, ["Shore", "Roots", "Mesa", "Gloom", "The Citadel"])

    def test_changed_segment_shape_fails_instead_of_publishing_partial_route(self):
        data = self.map_handler([0, 1, 2, 3])
        data["segments"].pop()
        with self.assertRaisesRegex(ValueError, "Expected five route segments"):
            derive_official_biome_route(data, self.BIOME_NAMES)


if __name__ == "__main__":
    unittest.main()
