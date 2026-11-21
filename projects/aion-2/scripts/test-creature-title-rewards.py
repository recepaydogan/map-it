"""Verify first-kill titles use achievement conditions and the item's actual target."""
import copy
import importlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
builder = importlib.import_module('creature-title-rewards')
achievement = {'AchievementId': {'Value': 1}, 'ObjType': 'EAchievementObjectiveType::KillNpc',
               'ObjValues': ['native-npc'], 'ResetCycleType': 'EResetCycleType::None',
               'UnlockAchievementId': {'Value': 0}}
tables = {
    'NpcData': [{'ID': {'Value': 10}, 'Name': 'native-npc'}],
    'Achievement': [achievement],
    'AchievementStep': [{'AchievementId': {'Value': 1}, 'Step': 1, 'Count': 1}],
    'AchievementReward': [{'AchievementId': 1, 'Step': 1, 'ItemRewards': [{'Item': 'title-item-99', 'Count': 1}]}],
    'Item': [{'Name': 'title-item-99', 'UseEffect': 'EItemUseEffect::GetTitle', 'UseEffectValues': ['20']}],
    'Title': [{'ID': {'Value': 20}, 'Name': 'title-20', 'Desc': 'Title name'}],
}
entry = {'id': 'NpcData:10', 'category': 'creatures', 'sections': []}
ctx = SimpleNamespace(entries={entry['id']: entry}, rows=lambda table: tables[table],
                      link=lambda *_: {'id': '99', 'name': 'Unlock item', 'icon': 'title.png'},
                      text=lambda text, fallback: text)
assert builder.build(ctx) == 1
link = entry['sections'][0]['links'][0]
assert link == {'id': 'Title:20', 'category': 'titles', 'name': 'Title name', 'icon': 'title.png'}
snapshot = copy.deepcopy(entry)
builder.build(ctx)
assert entry == snapshot
for field, invalid in [('ResetCycleType', 'Daily'), ('UnlockAchievementId', {'Value': 5}),
                       ('ObjValues', ['native-npc', 'another-npc']), ('ObjType', 'Quest')]:
    original = achievement[field]
    achievement[field] = invalid
    assert builder.build(ctx) == 0 and entry['sections'] == []
    achievement[field] = original
tables['AchievementStep'][0]['Count'] = 10
assert builder.build(ctx) == 0
tables['AchievementStep'][0]['Count'] = 1
tables['Item'][0]['UseEffectValues'] = ['missing-title']
try:
    builder.build(ctx)
except ValueError:
    pass
else:
    raise AssertionError('Unresolved title must fail explicitly')

root = Path('public/data/reference')
index = {entry['id'] for entry in json.loads((root / 'index.json').read_text('utf8'))['entries'] if entry['category'] == 'titles'}
title_data = json.loads((root / 'intelligence/titles.json').read_text('utf8'))['entries']
count = 0
for path in (root / 'creatures').glob('*.json'):
    for creature_id, creature in json.loads(path.read_text('utf8'))['entries'].items():
        for section in creature['sections']:
            if section['title'] == builder.SECTION:
                for title in section['links']:
                    assert title['id'] in index and title['category'] == 'titles'
                    assert 'rewardRates' not in title and 'quantity' not in title
                    assert any(source['id'] == creature_id for source in title_data[title['id']]['sources'])
                    count += 1
assert count > 0
assert any(source['id'] == 'NpcData:2400474' for source in title_data['Title:23020023']['sources'])
print(f'Validated {count} first-kill title links; repeatable, gated and multi-kill achievements are excluded.')
