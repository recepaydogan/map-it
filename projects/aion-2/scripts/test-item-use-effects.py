"""Prevent use-effect parameters from linking unrelated reference records."""
from collections import defaultdict
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context
from equipment import use_effect_links


class UseEffectLinksTest(unittest.TestCase):
    def setUp(self):
        self.ctx = Context.__new__(Context)
        self.ctx.aliases = {}
        self.ctx.entries = {}
        self.ctx.warnings = defaultdict(int)
        # Every table deliberately shares IDs, including the quantity value.
        for table in ['Skill', 'SkillAbnormal', 'Wing', 'VehicleList', 'Title', 'ContentsTicket']:
            for key in ['1', '2', '40']:
                identity = table + ':' + key
                self.ctx.aliases[(table, key)] = identity
                self.ctx.entries[identity] = {'id': identity, 'category': table, 'name': identity}

    def links(self, effect, values):
        return [link['id'] for link in use_effect_links(self.ctx, {
            'UseEffect': 'EItemUseEffect::' + effect, 'UseEffectValues': values,
        })]

    def test_imprint_parameters_do_not_link_skills_or_tickets(self):
        self.assertEqual(self.links('ImprintMagicStone', ['1', 'stone_group', 'equipment_group']), [])

    def test_reference_types_do_not_cross_tables(self):
        for effect, table in [('Skill', 'Skill'), ('GetWing', 'Wing'),
                              ('GetVehicle', 'VehicleList'), ('GetTitle', 'Title')]:
            with self.subTest(effect=effect):
                self.assertEqual(self.links(effect, ['1']), [table + ':1'])

    def test_trailing_quantity_is_not_a_reference(self):
        self.assertEqual(self.links('GetVehicleSoul', ['2', '1']), ['VehicleList:2'])
        self.assertEqual(self.links('AddContentsTicket', ['2', '40']), ['ContentsTicket:2'])

    def test_multi_ticket_skips_leading_quantity(self):
        self.assertEqual(self.links('AddMultiContentsTicket', ['40', '1', '2']),
                         ['ContentsTicket:1', 'ContentsTicket:2'])

    def test_unknown_effect_and_missing_values_have_no_links(self):
        self.assertEqual(self.links('FutureEffect', ['1']), [])
        self.assertEqual(use_effect_links(self.ctx, {'UseEffect': 'EItemUseEffect::Skill'}), [])

    def test_unresolved_reference_is_reported(self):
        self.assertEqual(self.links('Skill', ['999']), [])
        self.assertEqual(self.ctx.warnings['unresolved-Skill-links'], 1)


if __name__ == '__main__':
    unittest.main()
