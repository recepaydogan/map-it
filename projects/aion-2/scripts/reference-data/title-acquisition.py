"""Reverse verified first-kill title links into title acquisition sources."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from context import write


FIRST_KILL_SECTION = 'reference.loot.firstKillTitle'


def add_first_kill_sources(titles, public):
    sources = defaultdict(dict)
    creature_dir = Path(public) / 'data/reference/creatures'
    for path in sorted(creature_dir.glob('*.json')):
        for creature in json.loads(path.read_text('utf8'))['entries'].values():
            for section in creature['sections']:
                if section['title'] != FIRST_KILL_SECTION:
                    continue
                source = {key: creature[key] for key in ('id', 'category', 'name')}
                for title in section['links']:
                    if title['category'] != 'titles' or title['id'] not in titles:
                        raise ValueError('First-kill link has no published title: ' + title['id'])
                    sources[title['id']][source['id']] = source

    for title_id, boss_sources in sources.items():
        existing = {source['id']: source for source in titles[title_id]['sources']}
        existing.update(boss_sources)
        titles[title_id]['sources'] = list(existing.values())
    return sum(map(len, sources.values()))


def refresh(public, *, accept_stale_manifest=False):
    directory = Path(public) / 'data/reference/intelligence'
    title_path = directory / 'titles.json'
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text('utf8'))
    original = title_path.read_bytes()
    if not accept_stale_manifest and hashlib.sha256(original).hexdigest() != manifest['outputs']['titles']['sha256']:
        raise ValueError('Published title data differs from its manifest')
    payload = json.loads(original)
    count = add_first_kill_sources(payload['entries'], public)
    write(title_path, payload)
    updated = title_path.read_bytes()
    manifest['outputs']['titles'] = {'bytes': len(updated), 'sha256': hashlib.sha256(updated).hexdigest()}
    write(manifest_path, manifest)
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', default='public')
    parser.add_argument('--accept-stale-manifest', action='store_true')
    args = parser.parse_args()
    print(f'Linked {refresh(args.public, accept_stale_manifest=args.accept_stale_manifest)} first-kill boss sources to titles.')
