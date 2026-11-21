"""Build readable combat guides from a condition-aware effect graph."""
from collections import Counter
import hashlib
import importlib
from context import value, write

graph_module = importlib.import_module('combat-effect-graph')
condition_key = importlib.import_module('combat-conditions').condition_key
SOURCE_TABLES = ('NpcData', 'Skill', 'SkillString', 'SkillEffect', 'SkillEffectFilter',
                 'SkillAbnormal', 'SkillAbnormalEffect', 'SkillAbnormalString', 'SkillProjectile', 'StatCorrectionNumber')
ORDER = ['physicalDamage', 'magicDamage', 'mixedDamage', 'damage', 'singleTarget', 'multipleTargets', 'mixedTargets',
         'stun', 'root', 'slow', 'knockdown', 'silence', 'sleep', 'fear', 'airborne',
         'damageOverTime', 'drainMana', 'healSelf', 'shieldSelf', 'reflectSelf']


def readable(outcomes):
    outcomes = set(outcomes)
    if {'physicalDamage', 'magicDamage'} <= outcomes:
        outcomes.difference_update({'physicalDamage', 'magicDamage'})
        outcomes.add('mixedDamage')
    if {'singleTarget', 'multipleTargets'} <= outcomes:
        outcomes.difference_update({'singleTarget', 'multipleTargets'})
        outcomes.add('mixedTargets')
    return sorted(outcomes, key=ORDER.index)


def build(ctx, publish=True):
    graph = graph_module.CombatGraph(ctx)
    strings = {row['Name'].casefold(): row for row in ctx.rows('SkillString')}
    evidence, unresolved_creatures = [], []
    for npc in ctx.rows('NpcData'):
        entry = ctx.entries.get('NpcData:' + str(value(npc['ID'])))
        if not entry:
            continue
        groups, defenses = {}, {}
        links = {link['id']: link for section in entry['sections'] if section['title'] == 'reference.labels.skills'
                 for link in section.get('links', [])}
        for skill_id in dict.fromkeys(value(skill) for skill in npc.get('ActiveSkillList', [])):
            skill = graph.skills.get(skill_id)
            if not skill:
                evidence.append({'creature': entry['id'], 'skill': skill_id, 'resolved': [],
                                 'unpublished': [{'reason': 'active-skill-missing'}]})
                continue
            text = strings.get(skill['SkillString_Key'].casefold(), {})
            name = links.get('Skill:' + str(skill_id), {}).get('name') or ctx.text(text.get('SkillName'))
            sources, skipped = graph.resolve(skill_id)
            if not name:
                evidence.append({'creature': entry['id'], 'skill': skill_id, 'resolved': sources,
                                 'unpublished': [*skipped, {'reason': 'unresolved-localized-skill-name'}]})
                continue
            evidence.append({'creature': entry['id'], 'skill': skill_id, 'resolved': sources, 'unpublished': skipped})
            if not sources:
                continue
            for source in sources:
                if source.get('defense'):
                    defense = source['defense']
                    defenses[condition_key(defense)] = {'creatureId': entry['id'], **defense, 'origin': 'skill', 'triggers': []}
                if not source['outcomes']:
                    continue
                group = groups.setdefault(name, {'name': name, 'effects': set(), 'conditional': {}})
                if source['conditions']:
                    key = condition_key(source['conditions'])
                    branch = group['conditional'].setdefault(key, {'conditions': source['conditions'], 'effects': set()})
                    branch['effects'].update(source['outcomes'])
                else:
                    group['effects'].update(source['outcomes'])
        abilities = []
        for group in groups.values():
            ability = {'name': group['name'], 'effects': readable(group['effects'])}
            if group['conditional']:
                ability['conditional'] = [{'conditions': branch['conditions'], 'effects': readable(branch['effects'])}
                                          for branch in group['conditional'].values()]
            abilities.append(ability)
        entry['combatGuide'] = {'abilities': abilities, 'defenses': list(defenses.values())}
        if not abilities and not defenses:
            unresolved_creatures.append({'creature': entry['id'],
                'reason': 'no-active-skills' if not npc.get('ActiveSkillList') else 'no-supported-named-effects',
                'skillIds': [value(skill) for skill in npc.get('ActiveSkillList', [])]})
    creature_entries = [entry for entry in ctx.entries.values() if 'combatGuide' in entry]
    audit = {
        'version': 2,
        'tables': [{'name': name, 'sha256': hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()} for name in SOURCE_TABLES],
        'creatures': len(creature_entries),
        'creaturesWithCombat': sum(bool(entry['combatGuide']['abilities'] or entry['combatGuide']['defenses']) for entry in creature_entries),
        'creaturesWithDefenses': sum(bool(entry['combatGuide']['defenses']) for entry in creature_entries),
        'abilities': sum(len(entry['combatGuide']['abilities']) for entry in creature_entries),
        'conditionalAbilities': sum(bool(ability.get('conditional')) for entry in creature_entries for ability in entry['combatGuide']['abilities']),
        'unresolvedCreatures': unresolved_creatures,
        'uniqueSkillReasons': dict(Counter(reason for _, skipped in graph.cache.values()
                                          for reason in {row['reason'] for row in skipped})),
        'unpublishedDefenses': [{'abnormalId': identity, 'reason': reason} for identity, reason in graph.defenses.excluded.items()],
        'evidence': evidence,
    }
    ctx.combat_audit = audit
    if publish:
        write(ctx.public / 'data/reference/creature-combat-audit.json', audit)
    return {key: audit[key] for key in ('creatures', 'creaturesWithCombat', 'creaturesWithDefenses', 'abilities', 'conditionalAbilities')}
