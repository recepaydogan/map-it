"""Separate owned wing effects from reachable enhancement levels."""
from context import value


def build(ctx):
    for row in ctx.rows('Wing'):
        entry = ctx.entries.get('Wing:' + str(value(row['ID'])))
        if not entry:
            continue
        effects = [r for r in ctx.rows('WingEnchantEffect') if r['EffectGroup'] == row['EffectGroup']]
        base = next((r for r in effects if r['Level'] == 0), None)
        entry['sections'] = [s for s in entry['sections'] if s['title'] != 'reference.labels.owned-effects']
        if base:
            entry['sections'].append({'title': 'reference.labels.owned-effects', 'facts': ctx.stats(base['Stats'])})
        if row['EnchantGroup'] in ('None', ''):
            entry['sections'] = [s for s in entry['sections'] if s['title'] != 'reference.labels.upgrade-steps']
