"""Regression checks for verified text values and typed effect relationships."""
from collections import defaultdict
from pathlib import Path
import importlib
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context
from skills import effect_links
describe = importlib.import_module('effect-summary').describe


class ReferenceDescriptionTest(unittest.TestCase):
    def setUp(self):
        self.ctx = Context.__new__(Context)
        self.ctx.warnings = defaultdict(int)
        self.ctx.token_tables = {'se': {'1': {'EffectValueList': ['60000', '-1250']}},
                                 'abe': {'2': {'Values': ['350', '-1250']}}}

    def test_direct_values_and_explicit_units(self):
        self.assertEqual(self.ctx.resolve_tokens('{se:1:effect_value01:time}'), '60 s')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value01}'), '350')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value02:divide100abs}'), '12.5')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value02:noneabs}'), '1250')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value02:divide100}'), '-12.5')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value02:divide10}'), '-125')
        self.assertEqual(self.ctx.resolve_tokens('{abe:2:value02:divide1000}'), '-1.25')

    def test_unknown_formulas_and_missing_fields_remain_unresolved(self):
        for token in ['{se_abe_dmg:1:2:HpBarrierTotal:none}', '{abe:2:value99}',
                      '{se_dmg:1:SkillUIMaxDmgSum}', '{abe:2:value01:unknown}']:
            with self.subTest(token=token):
                self.assertEqual(self.ctx.resolve_tokens(token), '…')
        self.assertEqual(self.ctx.warnings['dynamic-description-values'], 4)

    def test_shield_summary_retains_unknown_total(self):
        text = 'For 60 s, creates a protective shield that absorbs 350 damage per hit, up to a maximum of ….'
        result = describe(text)
        self.assertEqual(result['summary']['values'], {'duration': 60, 'amount': 350})
        self.assertEqual(result['summaryNotice'], 'reference.useEffect.unknownShieldTotal')
        self.assertEqual(result['text'], text)

    def test_other_descriptions_are_not_reinterpreted(self):
        for text in ['Instantly restores … HP.', 'Absorbs 350 damage.', 'For 60 s, absorbs … damage.']:
            self.assertEqual(describe(text), {'text': text})
        self.assertEqual(describe(''), {})

    def test_item_descriptions_require_agreement_and_preserve_skill_prose(self):
        self.ctx.rows = lambda table: [
            {'ID': {'Value': key}, 'UseEffect': 'EItemUseEffect::Skill', 'UseEffectValues': [skill]}
            for key, skill in [(1, '10'), (2, '10'), (3, '20'), (4, '30')]]
        self.ctx.items = {'1': {'description': 'Restores HP.'}, '2': {'description': 'Restores MP.'},
                          '3': {'description': 'Creates a shield.'}, '4': {'description': 'Item prose.'}}
        self.ctx.entries = {'Skill:10': {}, 'Skill:20': {}, 'Skill:30': {'description': 'Skill prose.'}}
        importlib.import_module('effect-summary').attach_skill_descriptions(self.ctx)
        self.assertNotIn('description', self.ctx.entries['Skill:10'])
        self.assertEqual(self.ctx.entries['Skill:20']['description'], 'Creates a shield.')
        self.assertEqual(self.ctx.entries['Skill:30']['description'], 'Skill prose.')

    def test_chance_and_duration_cannot_become_effect_links(self):
        self.ctx.aliases = {('SkillAbnormal', key): 'SkillAbnormal:' + key for key in ['60000', '10000', '22120011']}
        self.ctx.entries = {identity: {'id': identity, 'name': identity, 'category': 'effects'} for identity in self.ctx.aliases.values()}
        row = {'EffectType': 'ESkillEffectType::Abnormal_True', 'EffectValueList': ['60000', '60000', '22120011', '1', '10000']}
        self.assertEqual([link['id'] for link in effect_links(self.ctx, row)], ['SkillAbnormal:22120011'])
        self.assertEqual(effect_links(self.ctx, {'EffectType': 'ESkillEffectType::Damage', 'EffectValueList': ['10000']}), [])
        self.assertEqual([link['id'] for link in effect_links(self.ctx, {'EffectType': 'ESkillEffectType::Abnormal_Passive', 'EffectValueList': ['22120011']})], ['SkillAbnormal:22120011'])


if __name__ == '__main__':
    unittest.main()
