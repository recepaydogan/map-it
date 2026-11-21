"""Regression checks for saved markers, linked panels and high-resolution terrain."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data/enshrouded'
SNAPSHOT=ROOT/'research/map-update-2026-11-16'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

class MapUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.points={p['id']:p for p in read(ROOT/'public/maps/enshrouded/metadata.json')['locations']}
        cls.old={p['id']:p for p in read(SNAPSHOT/'baseline/metadata.json')['locations']}
        cls.panels=read(DATA/'marker-panels.json')['markers']

    def test_saved_ids_and_verified_coordinates_survive(self):
        self.assertEqual(len(self.points),1663)
        self.assertEqual(len(self.points.keys()-self.old.keys()),624)
        self.assertTrue(self.old.keys()<=self.points.keys())
        aliases=read(ROOT/'research/wiki-map-comparison-2026-11-16/id-aliases.json')
        native=read(DATA/'map-source-corrections.json')['markerUpdates']
        protected={r['appId'] for r in aliases}|{r['id'] for r in native}
        for marker_id in protected:
            for field in ['x','y','referenceCoordinates']:
                self.assertEqual(self.points[marker_id][field],self.old[marker_id][field],marker_id)
        for row in aliases:
            self.assertNotIn(row['wikiId'],self.points)
            self.assertIn(row['wikiId'],self.points[row['appId']]['aliasIds'])

    def test_all_panel_links_resolve(self):
        progression=read(DATA/'progression-catalog.json');crafting=read(DATA/'crafting-catalog.json')
        ids={'wiki':{r['id'] for r in read(DATA/'wiki-catalog.json')['records']},
             'building':{r['sourcePage'] for r in read(DATA/'building-catalog.json')['records']},
             'crafting':{r['page'] for g in ['items','materials','stations'] for r in crafting[g]},
             'progression':{r['id'] for g in ['npcs','quests','sets','setItems'] for r in progression[g]},
             'bestiary':{r['wikiArticle'] for r in read(DATA/'bestiary-catalog.json')['records']}}
        self.assertEqual(self.points.keys(),self.panels.keys())
        for marker_id,panel in self.panels.items():
            for entry in panel['entries']:
                self.assertIn(entry['page'],ids[entry['catalog']],marker_id)
        self.assertEqual(read(SNAPSHOT/'unresolved-primary-panels.json'),[])

    def test_new_items_and_quests_have_real_panel_content(self):
        missing=[]
        for marker_id in self.points.keys()-self.old.keys():
            point=self.points[marker_id];panel=self.panels[marker_id]
            if not point.get('description') and not panel['entries'] and not panel['paragraphs']:
                missing.append(marker_id)
        self.assertEqual(missing,[])
        # Do not introduce pins with empty panels merely to match an upstream count.
        deferred=read(SNAPSHOT/'deferred-markers.json')
        self.assertEqual(len(deferred),4)
        self.assertTrue(all(r['id'] not in self.points for r in deferred))
        self.assertTrue(self.panels['TestSubjects-2']['paragraphs'][0]['textKey'])

    def test_asset_references_exist(self):
        for point in self.points.values():
            for field in ['iconPath','artworkPath']:
                if point.get(field):self.assertTrue((ROOT/'public'/point[field]).is_file(),point[field])
        for record in read(DATA/'wiki-catalog.json')['records']:
            if record.get('icon'):self.assertTrue((ROOT/'public'/record['icon']).is_file(),record['id'])

    def test_lore_parser_rejects_placeholders_and_matches_numbered_titles(self):
        parser=module('apply-enshrouded-map-update')
        self.assertEqual(parser.lore_text('<tabber>\n|-| A Note (1/2)= X\n</tabber>','A Note'),'')
        self.assertEqual(parser.lore_text('<tabber>\n|-| A Note (1/2)= A complete historical entry.\n</tabber>','A Note'),
                         'A complete historical entry.')

    def test_double_resolution_tiles_do_not_overlap(self):
        builder=module('build-enshrouded-content')
        with tempfile.TemporaryDirectory() as folder:
            builder.SOURCE=Path(folder);builder.MAP=Path(folder)/'map'
            colors={(0,0):(200,20,20),(1,0):(20,200,20),(0,1):(20,20,200),(1,1):(200,200,200)}
            tiles=[]
            for (x,y),color in colors.items():
                name=f'{x}_{y}.jpg';Image.new('RGB',(2560,2560),color).save(Path(folder)/name)
                tiles.append({'name':name,'path':name})
            builder.build_tiles(tiles)
            with Image.open(builder.MAP/'tiles/1/tile0x0.webp') as overview:
                for (x,y),color in colors.items():
                    actual=overview.getpixel((x*640+320,y*640+320))
                    self.assertLess(max(abs(a-b) for a,b in zip(actual,color)),8)

if __name__=='__main__':unittest.main()
