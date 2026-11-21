"""Read mode-specific encounter objectives and explicit combat NPC references."""
import hashlib
import json
from collections import defaultdict
from pathlib import Path

OBJECTIVE_KINDS = {
    'ClearBoardPuzzle': 'puzzle', 'KillSpawner': 'combat', 'KillNpc': 'combat',
    'KillNpcSubtype': 'combat', 'ClearWave': 'waves', 'NpcArriveWaypoint': 'escort',
    'UseEnvObj': 'interaction', 'CollectItem': 'collection',
}


def values(node):
    return [cell['value'] for cell in node.get('value_list', [])] or node.get('Value', [])


def tokens(cell):
    return {part.strip() for part in str(cell).split(',') if part.strip()}


def nodes(node):
    if isinstance(node, list):
        for child in node:
            yield from nodes(child)
    elif isinstance(node, dict):
        if 'Type' in node:
            yield node
        for child in node.values():
            if isinstance(child, (dict, list)):
                yield from nodes(child)


def read(ctx, directory):
    result = defaultdict(lambda: {'kinds': set(), 'objectives': [], 'combatNpcs': set(), 'combatSpawners': set(),
                                  'objects': set(), 'objectPurposes': {}, 'summonedNpcs': set(), 'waves': set(), 'effects': [], 'sources': []})
    paths = sorted(Path(directory).glob('*.json'))
    if not paths:
        raise ValueError('No decoded encounter events found: ' + str(directory))
    for path in paths:
        raw = path.read_bytes()
        export = json.loads(raw)
        data = export['data']
        entry = result[data['MapID']]
        entry['sources'].append({'asset': export['asset'], 'sha256': hashlib.sha256(raw).hexdigest()})
        for node in nodes(data):
            kind = OBJECTIVE_KINDS.get(node['Type'])
            if kind:
                entry['kinds'].add(kind)
            if kind and node.get('ShowUI') and node.get('Desc'):
                text = ctx.text(node['Desc'])
                if text and text not in entry['objectives']:
                    entry['objectives'].append(text)
            args = values(node)
            if args and node['Type'] in ('KillNpc', 'NpcDie'):
                entry['combatNpcs'].update(tokens(args[0]))
            if args and node['Type'] == 'KillSpawner':
                entry['combatSpawners'].update(tokens(args[0]))
            if args and node['Type'] == 'UseEnvObj':
                entry['objects'].update(tokens(args[0]))
                objects = tokens(args[0])
                # An outcome belongs to one explicit object, not every object
                # mentioned by a composite objective or the surrounding stage.
                if len(objects) == 1:
                    purpose = None
                    if node.get('ShowUI') and node.get('Desc'):
                        text = ctx.text(node['Desc'])
                        if text:
                            purpose = {'text': text}
                    for directive in node.get('PostDirectives', []):
                        parameters = values(directive)
                        if directive['Type'] == 'DynamicTerrainBlock' and len(parameters) == 2 and parameters[1].casefold() == 'false':
                            purpose = purpose or {'key': 'reference.adventure.opensPassage'}
                    if purpose:
                        entry['objectPurposes'].setdefault(next(iter(objects)), []).append({
                            'purpose': purpose, 'source': export['asset'], 'objectiveId': node.get('Id'),
                        })
            if args and node['Type'] in ('StartWave', 'ClearWave'):
                entry['waves'].update(tokens(args[0]))
            if len(args) >= 5 and node['Type'] == 'SummonAroundTarget':
                entry['summonedNpcs'].update(tokens(args[3]))
            if len(args) >= 3 and node['Type'] == 'AddAbnormal' and args[0].isdigit():
                entry['effects'].append({'abnormalId': int(args[0]), 'target': args[2],
                                         'source': export['asset'], 'directiveId': node['Id']})
        # Only a single explicit kill condition is translated into a player action.
        # Composite conditions stay undisclosed instead of being simplified incorrectly.
        for rule in data.get('GlobalConditions', []):
            conditions = rule.get('Conditions', [])
            if len(conditions) != 1 or len(conditions[0]) != 1:
                continue
            condition = conditions[0][0]
            if condition['Type'] != 'KillSpawner' or not values(condition):
                continue
            for directive in rule.get('Directives', []):
                for effect in entry['effects']:
                    if effect['source'] == export['asset'] and effect['directiveId'] == directive.get('Id'):
                        effect['defeatedSpawners'] = sorted(tokens(values(condition)[0]))
    return result
