"""Extract reviewed, public GTA VI article snapshots into the app catalog.

Requires beautifulsoup4. Source URLs and receipts remain in artifacts only.
"""
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'artifacts/gta6-wiki-import'
seeds = json.loads((CACHE / 'seeds.json').read_text(encoding='utf-8'))
records, images, provenance = [], [], []
game_stats = {
    'weapons': {'Damage', 'Handling', 'Accuracy', 'Range', 'Overall'},
    'vehicles': {'Speed', 'Acceleration', 'Asphalt Handling', 'Off-Road Handling', 'Strength'},
}
weapon_listing_labels = {'Price': 'Story Mode Price', 'Overall Rating': 'Overall'}

def text(element):
    value = element.get_text(' ', strip=True) if hasattr(element, 'get_text') else str(element)
    return re.sub(r'\s+([,.;:!?])', r'\1', re.sub(r'\s+', ' ', value.replace('\xa0', ' '))).strip()

def usable(value):
    return value and not re.fullmatch(r'(?:coming soon\.?|unknown|tba|tbd|n/?a|-+)', value, re.I)

for seed in seeds:
    source = urljoin('https://www.gtabase.com', seed['sourcePath'])
    soup = BeautifulSoup((CACHE / 'details' / (seed['id'] + '.html')).read_text(encoding='utf-8'), 'html.parser')
    body = soup.select_one('.com-content-article__body')
    assert body is not None, seed['id']
    article = body.find_parent(class_='com-content-article')
    heading = article.select_one('.page-header h1, h1') if article else None
    name = text(heading) if heading else seed['name']
    facts = {}
    for attr in seed['attributes']:
        label = attr['label']
        value = attr['value']
        value = ', '.join(map(str, value)) if isinstance(value, list) else str(value or '')
        if seed['kind'] == 'weapons':
            if label == 'Price' and value.isdecimal():
                value = f'${int(value):,}'
            label = weapon_listing_labels.get(label, label)
        if usable(value) and label != 'Discounted Trade Price (SecuroServ)':
            facts[label] = text(BeautifulSoup(value, 'html.parser'))
    for field in body.select('.field-entry'):
        label, value = field.select_one('.field-label'), field.select_one('.field-value')
        if not label or not value:
            continue
        parts = value.select('.multiple-values-line') or value.select('.category-items > ul > li.item-entry')
        label, value = text(label), '; '.join(text(part) for part in parts) if parts else text(value)
        if field.find_parent(class_='gta-stats') and (
            label not in game_stats.get(seed['kind'], ()) or not re.fullmatch(r'\d+(?:\.\d+)?', value)
        ):
            continue
        if usable(value) and len(value) < 900 and label not in ['Rating', 'Model ID']:
            facts[label] = value
    if 'Based on (Real Life)' in facts:
        facts.pop('Real Life Vehicle', None)
    category = facts.get('Weapon Class') or facts.get('Vehicle Class') or facts.get('Role', 'Character').split(',')[0]
    def description_text(p):
        if p.select_one('img, iframe, script'):
            return None
        value = text(p)
        if usable(value) and len(value) > 30 and not re.search(r'GTABase|click here|our database|our guide|\[snippet\b', value, re.I):
            return value
        return None

    paragraphs = []
    for child in body.find_all(recursive=False):
        if child.name in ['h2', 'h3'] and re.search(r'screenshots|artworks|video', text(child), re.I):
            break
        candidates = [child] if child.name in ['p', 'blockquote'] else child.select('blockquote')
        for p in candidates:
            value = description_text(p)
            if value and value not in paragraphs:
                paragraphs.append(value)
    if not paragraphs:
        # Some character biographies are wrapped in a plain div before the info table.
        paragraphs = list(dict.fromkeys(filter(None, map(description_text, body.select(':scope > div:not([class]) > p')))))
    # Use the actual entry artwork, never a tiny manufacturer/related-item icon.
    hero = body.select_one('.full-image-wrapper img, figure.item-image img')
    image_url = urljoin(source, hero.get('src')) if hero else urljoin('https://www.gtabase.com/', seed['thumbnail'])
    assert image_url.startswith('https://www.gtabase.com/'), image_url
    placeholder = re.search(r'(?:/|_)tba(?:_\d+x\d+)?\.(?:jpe?g|avif|webp)$', urlsplit(image_url).path.lower())
    artwork = {}
    if not placeholder:
        image = f"maps/wiki/{seed['kind']}/{seed['id']}.webp"
        thumbnail = image.replace('.webp', '-thumb.webp')
        images.append({'id': seed['id'], 'url': image_url, 'path': image, 'thumbnail': thumbnail})
        artwork = {'image': image, 'thumbnail': thumbnail}
    record = {'id': seed['id'], 'kind': seed['kind'], 'name': name, 'category': category, 'categories': category.split(', '),
              'manufacturer': facts.get('Manufacturer', ''), **artwork,
              'description': paragraphs, 'facts': [{'label': k, 'value': v} for k, v in facts.items()
                                                  if k not in ['Weapon Class', 'Vehicle Class', 'Manufacturer', 'New or Returning']],
              'newToSeries': facts.get('New or Returning') == 'New'}
    records.append(record)
    provenance.append({'id': seed['id'], 'url': source, 'imageUrl': image_url})

records.sort(key=lambda r: (r['kind'], r['name'].casefold()))
(CACHE / 'catalog-draft.json').write_text(json.dumps({'version': 1, 'records': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(CACHE / 'images.json').write_text(json.dumps(images, indent=2), encoding='utf-8')
(CACHE / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
print(json.dumps({'records': len(records), 'images': len(images), 'withoutDescription': sum(not r['description'] for r in records)}))
