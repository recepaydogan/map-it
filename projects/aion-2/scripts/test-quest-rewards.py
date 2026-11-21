"""Class-specific quest rewards retain their item identity and choice semantics."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from quests import add_rewards


class RewardContext:
    def facts(self, row, labels):
        return [{'label': label, 'value': row[key]} for key, label in labels.items() if key in row]

    def item_links(self, items):
        return [{'id': item['Item'], 'quantity': item['Count']} for item in items]

    def section(self, entry, title, **content):
        section = entry.setdefault(title, {'facts': [], 'links': []})
        for key, values in content.items():
            section[key].extend(values)


class QuestRewardTests(unittest.TestCase):
    def test_class_metadata_stays_with_each_reward(self):
        entry = {}
        add_rewards(RewardContext(), entry, [
            {'ExpReward': 120, 'ItemRewards': [{'Item': 'currency', 'Count': 7}]},
            {'Class': 'CharacterClass::Warrior', 'ItemNormalRewards': [{'Item': 'weapon-bound', 'Count': 1}]},
            {'Class': 'CharacterClass::Mage', 'ItemNormalRewards': [{'Item': 'weapon', 'Count': 2}],
             'ItemSelectRewards': [{'Item': 'choice', 'Count': 3}]},
        ])
        self.assertEqual(entry['Rewards']['facts'], [{'label': 'Experience', 'value': 120}])
        self.assertEqual(entry['Rewards']['links'], [
            {'id': 'currency', 'quantity': 7},
            {'id': 'weapon-bound', 'quantity': 1, 'note': 'Warrior'},
            {'id': 'weapon', 'quantity': 2, 'note': 'Mage'},
        ])
        self.assertEqual(entry['Choose a reward']['links'], [{'id': 'choice', 'quantity': 3, 'note': 'Mage'}])
        self.assertEqual(entry['Choose a reward']['facts'], [])


if __name__ == '__main__':
    unittest.main()
