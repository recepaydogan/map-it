"""Build a reader-facing box catalog without changing source identities."""
from collections import defaultdict
from copy import deepcopy
import json
import hashlib
from pathlib import Path
import re

from context import write

PREFIX = 'reference.labels.'
CONTENT = ('contents', 'choose-a-reward', 'possible-contents')
ACQUISITION = ('drops', 'merchants', 'gathering', 'shops', 'crafting', 'pickups', 'coinShops')
SOURCE_SECTIONS = ('additional-acquisition-sources', 'substance-conversion', 'crafted-from', 'available-from-boxes')


def unique(values):
    return list({json.dumps(v, sort_keys=True): v for v in values}.values())


def conditions(entry):
    return {f['label'].removeprefix(PREFIX): f['value'] for f in entry.get('facts', [])}


def technical(item):
    return not item.get('nameVerified') or bool(re.search(r'\btest\b', item['name'], re.I))


def covers(child, parent):
    """Only expand a package if its conditions cover the entire parent variant."""
    c, p = conditions(child), conditions(parent)
    for field in ('faction', 'class'):
        if c.get(field, 'All') not in ('All', 'None', p.get(field, 'All')):
            return False
    return (c.get('minimum-level', 0) <= p.get('minimum-level', 0)
            and c.get('maximum-level', 999) >= p.get('maximum-level', 999))


def build_catalog(items, entries, item_sections, acquisition):
    item_boxes = defaultdict(set)
    box_items = defaultdict(set)
    for item_id, sections in item_sections.items():
        if item_id not in items:
            continue
        for section in sections:
            if section['title'] == PREFIX + 'box-contents':
                for link in section.get('links', []):
                    if link['category'] == 'boxes' and link['id'] in entries:
                        item_boxes[item_id].add(link['id'])
                        box_items[link['id']].add(item_id)

    # Shared owning item identities establish variants; names alone never do.
    remaining = set(entries)
    groups = []
    while remaining:
        pending = [min(remaining)]
        member_ids, owner_ids = set(), set()
        while pending:
            box_id = pending.pop()
            if box_id in member_ids:
                continue
            member_ids.add(box_id)
            for item_id in box_items[box_id]:
                owner_ids.add(item_id)
                pending.extend(item_boxes[item_id] - member_ids)
        remaining -= member_ids
        groups.append((sorted(member_ids), sorted(owner_ids)))

    # Separate item IDs can still describe the exact same box. Require matching
    # item properties and contents before joining those families.
    equivalent = {}
    for ids, owner_ids in groups:
        owner_signatures = []
        for item_id in owner_ids:
            item = items[item_id]
            owner_signatures.append(json.dumps(
                {k: v for k, v in item.items() if k not in ('id', 'source', 'icon', 'duplicateOf', 'hiddenFromList')},
                sort_keys=True))
        content_signatures = sorted(set(json.dumps(entry['sections'], sort_keys=True)
                                        for entry in (entries[id] for id in ids)))
        key = json.dumps([sorted(set(owner_signatures)), content_signatures]) if owner_ids else ids[0]
        group = equivalent.setdefault(key, ([], []))
        group[0].extend(ids)
        group[1].extend(owner_ids)
    groups = [(sorted(set(ids)), sorted(set(owners))) for ids, owners in equivalent.values()]

    family_for = {box_id: ids[0] for ids, _ in groups for box_id in ids}
    family_items = {ids[0]: owners for ids, owners in groups}

    def item_link(item_id):
        item = items[item_id]
        return {k: item[k] for k in ('id', 'name', 'icon') if k in item} | {'category': 'items'}

    def expand(link, parent, visited):
        item = items.get(link['id']) if link['category'] == 'items' else None
        if not item or not technical(item) or link.get('note') or link.get('rewardRates'):
            return [deepcopy(link)], False
        candidates = [entries[id] for id in sorted(item_boxes[item['id']]) if covers(entries[id], parent)]
        signatures = {json.dumps(e['sections'], sort_keys=True) for e in candidates}
        # Choices, random rolls, cycles and ambiguous variants stay as containers.
        if not candidates or len(signatures) != 1 or item['id'] in visited:
            return [deepcopy(link)], False
        child = candidates[0]
        if not child['sections'] or any(s['title'] != PREFIX + 'contents' or not s.get('links') for s in child['sections']):
            return [deepcopy(link)], False
        result = []
        for section in child['sections']:
            for reward in section['links']:
                nested, _ = expand(reward, parent, visited | {item['id']})
                for value in nested:
                    value['quantity'] = value.get('quantity', 1) * link.get('quantity', 1)
                result.extend(nested)
        return result, True

    def source_links(owner_ids, visited=None):
        visited = set() if visited is None else visited
        result = []
        for item_id in owner_ids:
            if item_id in visited:
                continue
            visited.add(item_id)
            for section in item_sections.get(item_id, []):
                if section['title'].removeprefix(PREFIX) not in SOURCE_SECTIONS:
                    continue
                for original in section.get('links', []):
                    link = deepcopy(original)
                    if link['category'] == 'boxes' and link['id'] in family_for:
                        family_id = family_for[link['id']]
                        owners = family_items[family_id]
                        if owners and all(technical(items[id]) for id in owners):
                            result.extend(source_links(owners, visited))
                            continue
                        link['id'] = family_id
                    elif link['category'] == 'items' and item_boxes[link['id']]:
                        # The equivalent reference edge supplies the same source.
                        continue
                    result.append({k: v for k, v in link.items() if k not in ('quantity', 'rewardRates')})
        return unique(result)

    families = []
    for ids, owner_ids in groups:
        owners = sorted((items[id] for id in owner_ids), key=lambda i: (technical(i), i['id']))
        primary = owners[0] if owners else None
        name = primary['name'] if primary else entries[ids[0]]['name']
        hidden = not primary or all(technical(i) for i in owners)
        sources = source_links(owner_ids)
        acq = {key: unique([s for id in owner_ids for s in acquisition.get(id, {}).get(key, [])]) for key in ACQUISITION}
        # These are presentation hints, never proof of current availability.
        promotional = bool(re.search(r"founder['’]?s?\s+pack|pack\s+upgrade|pre[- ]regist(?:ration|er)", name, re.I))
        in_game = any(acq.values()) or any(s['category'] != 'boxes' for s in sources)
        kind = 'store' if promotional else 'gameplay' if in_game else 'unknown'
        variants = []
        for id in ids:
            entry = entries[id]
            sections, flattened = [], False
            for section in entry['sections']:
                if section['title'].removeprefix(PREFIX) not in CONTENT:
                    continue
                links = []
                for link in section.get('links', []):
                    expanded, changed = expand(link, entry, set()) if section['title'] == PREFIX + 'contents' else ([deepcopy(link)], False)
                    links.extend(expanded)
                    flattened |= changed
                sections.append({**deepcopy(section), 'links': links})
            variants.append({'id': id, 'facts': entry['facts'], 'sections': sections, 'flattened': flattened})
        family = {'id': ids[0], 'name': name, 'kind': kind, 'technical': hidden,
                  'items': [item_link(i['id']) for i in owners], 'variants': variants,
                  'sources': sources, 'acquisition': acq}
        if primary and primary.get('icon'):
            family['icon'] = primary['icon']
        family['preview'] = [{'name': l['name'], 'quantity': l.get('quantity', 1)}
                             for s in variants[0]['sections'] if s['title'] == PREFIX + 'contents'
                             for l in s.get('links', []) if not technical(items.get(l['id'], {'name': l['name']}))][:2]
        families.append(family)

    family_by_id = {family['id']: family for family in families}
    # Follow verified container relationships, without treating unknown roots as
    # evidence of an in-game or store acquisition route.
    for _ in range(len(families)):
        changed = False
        for family in families:
            source_kinds = {family_by_id[l['id']]['kind'] for l in family['sources']
                            if l['category'] == 'boxes' and l['id'] in family_by_id and l['id'] != family['id']}
            if family['kind'] == 'unknown' and len(source_kinds) == 1 and 'unknown' not in source_kinds:
                family['kind'] = next(iter(source_kinds))
                changed = True
        if not changed:
            break
    for family in families:
        for link in family['sources']:
            if link['category'] == 'boxes' and link['id'] in family_by_id:
                link['name'] = family_by_id[link['id']]['name']
        for variant in family['variants']:
            for section in variant['sections']:
                for link in section.get('links', []):
                    if link['category'] == 'items' and item_boxes[link['id']]:
                        target = family_by_id[family_for[min(item_boxes[link['id']])]]
                        link.update({'id': target['id'], 'category': 'boxes', 'name': target['name']})
                        if target['technical']:
                            link['unresolvedName'] = True
                    elif link['category'] == 'items' and link['id'] in items and technical(items[link['id']]):
                        link['unresolvedName'] = True
    return {'version': 1, 'families': sorted(families, key=lambda f: (f['technical'], f['name'].casefold(), f['id']))}


def publish(public):
    public = Path(public)
    root = public / 'data/reference'
    items = {i['id']: i for i in json.loads((public / 'data/items/catalog.json').read_text('utf8'))['items']}
    summaries = [s for s in json.loads((root / 'index.json').read_text('utf8'))['entries'] if s['category'] == 'boxes']
    chunks = {s['chunk']: None for s in summaries}
    for chunk in chunks:
        chunks[chunk] = json.loads((root / 'boxes' / (chunk + '.json')).read_text('utf8'))['entries']
    entries = {s['id']: chunks[s['chunk']][s['id']] for s in summaries}
    sections = {k: v for p in sorted((root / 'items').glob('*.json')) for k, v in json.loads(p.read_text('utf8'))['items'].items()}
    acquisition = {k: v for p in sorted((public / 'data/items/acquisition').glob('*.json')) for k, v in json.loads(p.read_text('utf8')).get('items', {}).items()}
    catalog = build_catalog(items, entries, sections, acquisition)
    summaries, chunks = [], defaultdict(dict)
    for family in catalog['families']:
        chunk = hashlib.sha256(family['id'].encode()).hexdigest()[:2]
        summaries.append({k: v for k, v in family.items() if k in ('id', 'name', 'icon', 'kind', 'technical', 'preview')}
                         | {'variantIds': [v['id'] for v in family['variants']], 'chunk': chunk})
        chunks[chunk][family['id']] = family
    for chunk, families in chunks.items():
        write(root / 'box-details' / (chunk + '.json'), {'version': 1, 'families': families})
    write(root / 'box-catalog.json', {'version': 1, 'families': summaries})
    return catalog
