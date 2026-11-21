"""Summarize explicit localized descriptions without interpreting combat formulas."""
import re
from collections import defaultdict
from context import value


def describe(description):
    if not description:
        return {}
    result = {'text': description}
    # The text states both units; the unresolved total is not inferred from parameters.
    shield = re.fullmatch(
        r'For (\d+(?:\.\d+)?) s, creates a protective shield that absorbs '
        r'(\d+(?:,\d{3})*) damage per hit, up to a maximum of …\.', description)
    if shield:
        result['summary'] = {
            'key': 'reference.useEffect.shield',
            'values': {'duration': float(shield[1]), 'amount': int(shield[2].replace(',', ''))},
        }
        result['summaryNotice'] = 'reference.useEffect.unknownShieldTotal'
    return result


def attach_skill_descriptions(ctx):
    """Use item prose only when all items invoking a skill agree on its description."""
    descriptions = defaultdict(set)
    for row in ctx.rows('Item'):
        parameters = row.get('UseEffectValues', [])
        if row.get('UseEffect') != 'EItemUseEffect::Skill' or not parameters:
            continue
        description = ctx.items[str(value(row['ID']))].get('description')
        if description:
            descriptions['Skill:' + str(value(parameters[0]))].add(description)
    for identity, candidates in descriptions.items():
        entry = ctx.entries.get(identity)
        if entry is not None and not entry.get('description') and len(candidates) == 1:
            entry['description'] = next(iter(candidates))
