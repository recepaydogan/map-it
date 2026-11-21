"""Attach stone results and transfer chance references to their owning items."""
from collections import defaultdict
from context import value, human, PERCENT_STATS


def build(ctx):
    groups = defaultdict(list)
    for row in ctx.rows('ImprintMagicStoneProb'):
        if row['AddStatProb'] <= 0:
            continue
        stat = row['AddStatType'].split('::')[-1]
        groups[row['ImprintGroupName']].append({
            'name': ctx.text('StatName_' + stat, human(stat)),
            'chance': row['AddStatProb'] / 100,
            'results': [{'grade': human(s['StatGrade']),
                         'value': s['StatValue'] / 100 if stat in PERCENT_STATS else s['StatValue'],
                         'isPercent': stat in PERCENT_STATS, 'chance': s['StatProb'] / 100}
                        for s in row['StatInfos'] if s['StatProb'] > 0],
        })
    transfer_links = [{'id': entry['id'], 'category': entry['category'], 'name': entry['name']}
                      for entry in ctx.entries.values() if entry['id'].startswith('ItemSuccessionProb:')]
    for row in ctx.rows('Item'):
        item_id = str(value(row['ID']))
        if row.get('UseEffect') == 'EItemUseEffect::ImprintMagicStone':
            results = [result for key in row.get('UseEffectValues', []) for result in groups.get(key, [])]
            if results:
                ctx.item_section(item_id, 'Imprint chances', imprintResults=results)
        if row.get('SuccessionGroup') not in (None, '', 'None') or row.get('UseEffect') == 'EItemUseEffect::Succession':
            ctx.item_section(item_id, 'Transfer chances', links=transfer_links)
