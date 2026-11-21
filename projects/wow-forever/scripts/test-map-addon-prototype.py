"""Check real Lua runtimes, projection parity, UI lifecycle and shipped textures."""
import importlib
import json
import subprocess
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'dist/addon-prototype/wfm-map-prototype'
REPORT = json.loads((PACKAGE.parent / 'build-report.json').read_text())
HARNESS = r'''
frames = {}; SlashCmdList = {}; UISpecialFrames = {}; tinsert = table.insert
unpack = unpack or table.unpack
secret = {}; function issecretvalue(v) return v == secret end
local methods = {}
function methods:SetSize(w,h) self.width=w; self.height=h end
function methods:SetHeight(h) self.height=h end
function methods:SetWidth(w) self.width=w end
function methods:GetWidth() return self.width or 1000 end
function methods:GetHeight() return self.height or 600 end
function methods:GetEffectiveScale() return self.scale or 1 end
function methods:SetFrameLevel(v) self.level=v end
function methods:GetFrameLevel() return self.level or 1 end
function methods:SetScript(k,v) self.scripts[k]=v end
function methods:SetText(t) self.textValue=t; if self.scripts.OnTextChanged then self.scripts.OnTextChanged(self) end end
function methods:GetText() return self.textValue or '' end
function methods:GetStringHeight() return math.max(14,math.ceil(#(self.textValue or '')/math.max(1,(self.width or 100)/6))*14) end
function methods:SetScrollChild(child) self.scrollChild=child end
function methods:SetVerticalScroll(value) self.scrollOffset=value end
function methods:SetMinMaxValues(a,b) self.minValue=a; self.maxValue=b end
function methods:GetValue() return self.value or 0 end
function methods:SetValue(value)
 local previous=self:GetValue()
 self.value=math.max(self.minValue or 0,math.min(self.maxValue or 100,value))
 if previous~=self.value and self.scripts.OnValueChanged then self.scripts.OnValueChanged(self,self.value) end
end
function methods:SetPoint(...) self.point={...} end
function methods:SetTexture(t) self.texturePath=t end
function methods:SetShown(v) if v then self:Show() else self:Hide() end end
function methods:Show() local was=self.shown; self.shown=true; if not was and self.scripts.OnShow then self.scripts.OnShow(self) end end
function methods:Hide() local was=self.shown; self.shown=false; if was and self.scripts.OnHide then self.scripts.OnHide(self) end end
function methods:IsShown() return self.shown end
function methods:GetLeft() return self.left or 0 end
function methods:GetTop() return 600 end
function methods:GetBottom() return self.bottom or 0 end
function methods:IsOwned() return false end
function methods:IsMouseOver() return self.mouseOver or false end
local ignored = {'SetClipsChildren','EnableMouse','EnableMouseWheel','SetAllPoints','SetBackdrop','SetBackdropColor',
 'SetBackdropBorderColor','SetClampedToScreen','SetMovable','SetFrameStrata','RegisterForDrag','SetTextColor',
 'SetAlpha','SetRotation','SetVertexColor','SetTexCoord','SetResizable','SetResizeBounds','SetFont','SetJustifyH','StartSizing','SetColorTexture','ClearAllPoints','StartMoving','StopMovingOrSizing','SetOwner','AddLine','RegisterEvent',
 'SetAutoFocus','SetFontObject','SetTextInsets','SetMaxLetters','ClearFocus','SetOrientation','SetValueStep','SetObeyStepOnDrag','SetThumbTexture','SetJustifyV'}
for _, name in ipairs(ignored) do methods[name] = function() end end
function CreateFrame(kind,name,parent)
 local f=setmetatable({scripts={},shown=true,kind=kind,name=name,parent=parent},{__index=methods})
 frames[#frames+1]=f; if name then _G[name]=f end; return f
end
function methods:CreateTexture() return CreateFrame('Texture',nil,self) end
function methods:CreateFontString() return CreateFrame('FontString',nil,self) end
UIParent=CreateFrame('Frame'); UIParent:SetSize(1920,1080)
GameTooltip=CreateFrame('Tooltip')
worldX, worldY, worldMap = -8950, -130, 0
function UnitPosition() return worldX, worldY, 30, worldMap end
function GetPlayerFacing() return 0 end
cursorX,cursorY,mouseDown=500,300,false
function GetCursorPosition() return cursorX,cursorY end
function IsMouseButtonDown() return mouseDown end
function print() end
STANDARD_TEXT_FONT='font'
function GetTime() return 100 end
bindings={}; combat=false; savedBindings=0
function GetBindingKey(action) for key,value in pairs(bindings) do if value==action then return key end end end
function GetBindingAction(key) return bindings[key] or '' end
function SetBinding(key,action) bindings[key]=action; return true end
function GetCurrentBindingSet() return 2 end
function SaveBindings(set) assert(set==2); savedBindings=savedBindings+1 end
function InCombatLockdown() return combat end
NS={}
'''


class PrototypeTests(unittest.TestCase):
    def runtimes(self):
        for version in ['lua51', 'lua54']:
            runtime = importlib.import_module('lupa.' + version).LuaRuntime(unpack_returned_tuples=True)
            runtime.execute(HARNESS)
            for filename in [line.strip() for line in (PACKAGE / 'wfm-map-prototype.toc').read_text().splitlines() if line.strip().endswith('.lua')]:
                runtime.execute((PACKAGE / filename).read_text(encoding='utf-8'), 'wfm-map-prototype', runtime.globals().NS)
            yield version, runtime

    def test_projection_matches_existing_application(self):
        script = """
import {build} from 'esbuild';
const out=await build({entryPoints:['src/features/live-position/position-projection.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {projectPlayerPosition}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const cases=[];
for(const map of [0,1,2991]) for(const [x,y] of [[0,0],[-8950,-130],[10337.2,783.6],[-4000,-1000]]) cases.push({map,x,y,expected:projectPlayerPosition(map,x,y)});
console.log(JSON.stringify(cases));
"""
        cases = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))
        for version, lua in self.runtimes():
            ns = lua.globals().NS
            for case in cases:
                with self.subTest(lua=version, case=case):
                    x, y = ns.Core.Project(ns.Data.projection, case['map'], case['x'], case['y'])
                    self.assertAlmostEqual(x, case['expected']['x'], places=7)
                    self.assertAlmostEqual(y, case['expected']['y'], places=7)
            self.assertIsNone(ns.Core.Project(ns.Data.projection, 9999, 1, 2))
            self.assertIsNone(ns.Core.Project(ns.Data.projection, 0, lua.globals().secret, 2))
            self.assertIsNone(ns.Core.Project(ns.Data.projection, 0, float('nan'), 2))

    def test_ui_lifecycle_movement_restrictions_and_drag(self):
        for version, lua in self.runtimes():
            with self.subTest(lua=version):
                lua.execute(r'''
local root=WFMMapPrototypeFrame
for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,'ADDON_LOADED','wfm-map-prototype') end end
assert(root:GetWidth()==410 and root:GetHeight()==370)
assert(not root:IsShown())
SlashCmdList.WFMMAPPROTOTYPE(); assert(root:IsShown())
root.scripts.OnUpdate(root,0.1)
local canvas, player, follow, overview, filterButton
for _,f in ipairs(frames) do
 if f.scripts.OnMouseWheel and f.scripts.OnMouseDown and f.parent==root then canvas=f end
 if f.kind=='Texture' and f.texturePath and string.find(f.texturePath,'player-ring',1,true) then player=f.parent end
 if f.kind=='Button' then
  if f.tooltip==NS.Data.strings.followOn then follow=f end
  if f.tooltip==NS.Data.strings.overview then overview=f end
  if f.tooltip==NS.Data.strings.filters then filterButton=f end
 end
end
assert(canvas and player and follow and overview and filterButton)
assert(player:IsShown())
local tileCount=0
for _,f in ipairs(frames) do if f.texturePath and string.find(f.texturePath,'textures',1,true) and f:IsShown() then tileCount=tileCount+1 end end
assert(tileCount>0)
worldX=worldX+10; root.scripts.OnUpdate(root,0.1); assert(player:IsShown())
worldX=secret; root.scripts.OnUpdate(root,0.1); assert(not player:IsShown())
worldX=-8950; worldMap=9999; root.scripts.OnUpdate(root,0.1); assert(not player:IsShown())
worldMap=0; root.scripts.OnUpdate(root,0.1); assert(player:IsShown())
local original=UnitPosition; UnitPosition=function() error('restricted') end
root.scripts.OnUpdate(root,0.1); assert(not player:IsShown()); UnitPosition=original
filterButton.scripts.OnClick(); root.scripts.OnUpdate(root,0.1)
for _,f in ipairs(frames) do if f.item and f.item.isGroup then f.scripts.OnClick(f); break end end
for _,f in ipairs(frames) do if f.item and not f.item.isGroup and not f.item.isAll and f.label then f.scripts.OnClick(f); break end end
assert(type(WFM_MapPrototypeDB.enabled)=='table')
overview.scripts.OnClick(); root.scripts.OnUpdate(root,0.1)
assert(follow.tooltip==NS.Data.strings.followOff)
canvas.scripts.OnMouseWheel(canvas,1); root.scripts.OnUpdate(root,0.1)
follow.scripts.OnClick(); root.scripts.OnUpdate(root,0.1)
mouseDown=true; canvas.scripts.OnMouseDown(canvas,'LeftButton'); cursorX=cursorX+20
root.scripts.OnUpdate(root,0.1); assert(follow.tooltip==NS.Data.strings.followOff)
mouseDown=false; root.scripts.OnUpdate(root,0.1)
local poolCount=#frames
for i=1,100 do root.scripts.OnUpdate(root,0.1) end
assert(#frames==poolCount, 'Idle frames must not allocate new textures or pins')
SlashCmdList.WFMMAPPROTOTYPE(); assert(not root:IsShown())
assert(WFM_MapPrototypeDB.width==410)
''')

    def test_zoom_preserves_cursor_world_point(self):
        for _, lua in self.runtimes():
            core = lua.globals().NS.Core
            cx, cy = core.Zoom(15000, 10000, .1, .2, 100, 200, 1000, 600)
            self.assertEqual(core.Screen(11000, 9000, cx, cy, .2, 1000, 600), (100, 200))

    def test_marker_geometry_and_overview_clusters_match_desktop(self):
        script = """
import { readFile } from 'node:fs/promises';
import * as c from './dist/addon-prototype/map-config-runtime.mjs';
const {data} = JSON.parse(await readFile('./dist/addon-prototype/build-report.json','utf8'));
const categories = ['dungeon', 'rare', 'npc', 'gatherable-herb-peacebloom', 'gatherable-ore-copper-vein'];
const points = categories.map((category, i) => ({ ...data.markers.find(p => p.category === category), x: 500 + 40*i, y: 500 + 24*i }));
points.push({ ...points[0], id: 'second-dungeon', x: 820, y: 560, idOrder: 50000 });
points.push({ ...points[0], id: 'third-dungeon', x: 1100, y: 600, idOrder: 50001 });
const sizes = {groups: Object.fromEntries(c.MAP_CATEGORY_GROUPS.map(g => [g.id,100])), categories:{}};
const geometry = points.flatMap(point => [.01, .02, .035, .18, .45].flatMap(zoom =>
  ['normal', 'selected', 'cluster', 'canvas'].map(variant => ({
    id:point.id, zoom, variant,
    size: (c.isQuestPoint(point) ? 27 : variant === 'canvas' ? c.MARKER_SPRITE_SIZE : c.MAP_MARKER_SIZES[variant])
      * c.getMapPointMarkerScale(point,sizes) * c.getMapMarkerZoomScale(zoom,'top'),
  }))));
const clusterZoom=.02;
const clusters=c.createMapPointClusters(points.map(point => ({point,left:point.x*clusterZoom,top:point.y*clusterZoom})),null,clusterZoom)
  .map(cluster=>({key:cluster.key,x:cluster.left+cluster.offsetX,y:cluster.top+cluster.offsetY,members:cluster.items.map(({point})=>point.id)}));
console.log(JSON.stringify({points,geometry,clusters}));
"""
        expected=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
        for version,lua in self.runtimes():
            with self.subTest(lua=version):
                core=lua.globals().NS.Core
                points={p['id']:lua.table_from(p,recursive=True) for p in expected['points']}
                for entry in expected['geometry']:
                    size,_=core.MarkerSize(points[entry['id']],entry['zoom'],entry['variant'])
                    self.assertAlmostEqual(size,entry['size'])
                active={filter_id:True for point in expected['points'] for filter_id in point['filterIds']}
                state=lua.table_from(dict(cx=0,cy=0,zoom=.02,enabled=active),recursive=True)
                index=core.Index(lua.table_from(list(points.values())))
                visible,*_=core.Visible(index,state,410,370)
                actual={pin.key:pin for pin in visible.values()}
                for cluster in expected['clusters']:
                    pin=actual[cluster['key']]
                    self.assertAlmostEqual(pin.x,205+cluster['x'])
                    self.assertAlmostEqual(pin.y,185+cluster['y'])
                    self.assertEqual([m.id for m in pin.members.values()],cluster['members'])
                self.assertEqual(len(actual),len(expected['clusters']))
                state.zoom=.035
                visible,*_=core.Visible(index,state,410,370)
                self.assertTrue(all(pin.count==1 for pin in visible.values()))
                state.selected=expected['points'][3]['id']
                visible,*_=core.Visible(index,state,410,370)
                self.assertEqual(visible[1].marker.id,state.selected)

    def test_pan_keeps_cluster_members_and_representatives_stable(self):
        for _, lua in self.runtimes():
            lua.execute('''
local markers={
 {id='z',x=511,y=511,sprite='a',category='bank',priority=10},
 {id='a',x=514,y=514,sprite='a',category='bank',priority=10},
 {id='b',x=515,y=514,sprite='b',category='bank',priority=20},
}
local grid=NS.Core.Index(markers)
for _,zoom in ipairs({.02,.18,.5,3}) do
 local state={cx=512,cy=512,zoom=zoom,enabled={bank=true}}
 local before=NS.Core.Visible(grid,state,1000,600)
 for dx=-64,64 do
  state.cx=512+dx/zoom; state.cy=512-dx/zoom
  local after=NS.Core.Visible(grid,state,1000,600)
  assert(#before==#after, 'Panning changed cluster membership')
  for i,a in ipairs(before) do
   local b=after[i]
   assert(a.key==b.key and a.marker.id==b.marker.id and a.count==b.count)
   assert(math.abs(b.x-a.x+dx)<.000001 and math.abs(b.y-a.y-dx)<.000001)
   for j,m in ipairs(a.members) do assert(m.id==b.members[j].id) end
  end
 end
end
-- A member outside the viewport must not change a visible cluster's count.
local state={cx=512,cy=512,zoom=.02,enabled={bank=true}}
local before=NS.Core.Visible(grid,state,1000,600)
state.cx=514+(500-12.01)/.02
local after=NS.Core.Visible(grid,state,1000,600)
assert(#after==#before)
for i,a in ipairs(before) do assert(a.marker.id==after[i].marker.id and a.count==after[i].count) end
''')

    def test_resize_tracks_cursor_scale_clamps_and_saves(self):
        for _, lua in self.runtimes():
            lua.execute('''
local root=WFMMapPrototypeFrame
for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,'ADDON_LOADED','wfm-map-prototype') end end
local handle,header
for _,f in ipairs(frames) do
 if f.tooltip==NS.Data.strings.resize then handle=f end
 if f.scripts.OnDragStart then header=f end
end
assert(handle and header and handle:GetFrameLevel()>header:GetFrameLevel())
root.left=1300; root.bottom=24; root.scale=.8
root:Show(); mouseDown=true; cursorX=1000; cursorY=500
handle.scripts.OnMouseDown(handle,'LeftButton')
assert(root.point[1]=='BOTTOMRIGHT' and root.point[4]==1710 and root.point[5]==24)
cursorX=920; cursorY=548; root.scripts.OnUpdate(root,.1)
assert(root:GetWidth()==510 and root:GetHeight()==430)
cursorX=2000; cursorY=-1000; root.scripts.OnUpdate(root,.1)
assert(root:GetWidth()==240 and root:GetHeight()==200)
cursorX=-2000; cursorY=2000; root.scripts.OnUpdate(root,.1)
assert(root:GetWidth()==1200 and root:GetHeight()==900)
-- Releasing outside the handle must end resizing and persist the layout.
mouseDown=false; root.scripts.OnUpdate(root,.1)
assert(WFM_MapPrototypeDB.width==1200 and WFM_MapPrototypeDB.height==900)
cursorX=1000; cursorY=500; root.scripts.OnUpdate(root,.1)
assert(root:GetWidth()==1200 and root:GetHeight()==900)
''')

    def test_pan_keeps_pin_identity_and_overlap_order(self):
        for _, lua in self.runtimes():
            lua.execute('''
local root=WFMMapPrototypeFrame
root:Show(); root.scripts.OnUpdate(root,.1)
local canvas,player
for _,f in ipairs(frames) do
 if f.scripts.OnMouseWheel and f.scripts.OnMouseDown and f.parent==root then canvas=f end
 if f.texturePath and string.find(f.texturePath,'player-ring',1,true) then player=f.parent end
end
local function snapshot()
 local result={}
 for _,f in ipairs(frames) do if f.key and f.item and f:IsShown() then result[f.key]=f end end
 return result
end
local before=snapshot(); local count=0
for _ in pairs(before) do count=count+1 end
assert(count>1)
mouseDown=true; canvas.scripts.OnMouseDown(canvas,'LeftButton')
for dx=5,60,5 do
 cursorX=500+dx; root.scripts.OnUpdate(root,.1)
 local after=snapshot(); local checked=0; local levels={}
 for key,pin in pairs(after) do
  assert(not levels[pin:GetFrameLevel()], 'Pins share an ambiguous draw level')
  levels[pin:GetFrameLevel()]=true
  assert(player:GetFrameLevel()>pin:GetFrameLevel())
  if before[key] then assert(before[key]==pin, 'Visible pin frame was reassigned'); checked=checked+1 end
  for _,other in pairs(after) do
   local a,b=pin.item.marker,other.item.marker
   local tieWins=pin.variant=='canvas' and a.idOrder>b.idOrder
     or pin.variant~='canvas' and pin.item.order>other.item.order
   if a.priority>b.priority or (a.priority==b.priority and tieWins) then
    assert(pin:GetFrameLevel()>other:GetFrameLevel(), 'Overlap order flipped')
   end
  end
 end
 assert(checked>0)
end
mouseDown=false; root.scripts.OnUpdate(root,.1)
''')

    def test_spatial_filtering_and_pool_limit(self):
        for _, lua in self.runtimes():
            lua.execute('''
local grid=NS.Core.Index(NS.Data.markers)
local state={cx=16384,cy=10922.5,zoom=.02,enabled={}}
assert(#NS.Core.Visible(grid,state,1000,600)==0)
state.enabled.bank=true
local banks=NS.Core.Visible(grid,state,1000,600)
assert(#banks>0)
for _,p in ipairs(banks) do assert(p.marker.category=='bank' or p.marker.category=='bank-sign') end
for _,c in ipairs(NS.Data.categories) do state.enabled[c.id]=true end
local visible,omitted=NS.Core.Visible(grid,state,1000,600)
assert(#visible<=600 and omitted>=0)
for _,p in ipairs(visible) do assert(p.x>=-32 and p.x<=1032 and p.y>=-32 and p.y<=632) end
''')

    def test_textures_and_marker_integrity(self):
        data = REPORT['data']
        self.assertEqual(len({m['id'] for m in data['markers']}), len(data['markers']))
        for marker in data['markers']:
            self.assertTrue(marker['name'])
            self.assertTrue((PACKAGE / marker['sprite'].replace('\\', '/')).is_file())
        self.assertEqual(REPORT['missingIcons'], [])
        for tile in data['tiles']:
            with Image.open(PACKAGE / tile['path'].replace('\\', '/')) as image:
                self.assertEqual(image.size, (512, 512))
                self.assertEqual(image.mode, 'RGBA')
        # Pixel-exact comparison catches swapped BGRA channels and upside-down TGA output.
        source = ROOT / 'public/maps/wdt-775971/tiles/2/tile0x0.webp'
        with Image.open(source) as original, Image.open(PACKAGE / 'textures/map-0/2/tile-0-0.tga') as converted:
            self.assertIsNone(ImageChops.difference(original.convert('RGBA'), converted).getbbox())

    def test_filter_search_bulk_actions_scroll_and_defaults(self):
        for _, lua in self.runtimes():
            lua.execute('''
for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,'ADDON_LOADED','wfm-map-prototype') end end
local filters
for _,f in ipairs(frames) do if f.search and f.rows then filters=f end end
assert(filters); filters:Show()
assert(filters.rows[1].item.isGroup)
assert(filters.rows[1].item.open)
filters.rows[1].scripts.OnClick(filters.rows[1])
assert(not filters.rows[1].item.open)
filters.rows[1].scripts.OnClick(filters.rows[1])
assert(not filters.rows[2].item.isGroup)
local row=filters.rows[2]; local id=row.item.id
assert(not row.check:IsShown())
row.scripts.OnClick(row); local toggled=WFM_MapPrototypeDB.enabled[id]
row.scripts.OnClick(row); assert(WFM_MapPrototypeDB.enabled[id]~=toggled)
filters.search:SetText('  bank  ')
local count=0
for _,row in ipairs(filters.rows) do if row:IsShown() and not row.item.isGroup then assert(string.find(string.lower(row.item.label),'bank',1,true)); count=count+1 end end
assert(count>0)
local bankRow
for _,r in ipairs(filters.rows) do if r:IsShown() and r.item.id=='bank' then bankRow=r end end
assert(bankRow); bankRow.only.scripts.OnClick()
for id,on in pairs(WFM_MapPrototypeDB.enabled) do assert(on==(id=='bank')) end
bankRow.only.scripts.OnClick()
for _,on in pairs(WFM_MapPrototypeDB.enabled) do assert(not on) end
filters.hideAll.scripts.OnClick()
assert(WFM_MapPrototypeDB.enabled.bank==false)
filters.showAll.scripts.OnClick()
assert(WFM_MapPrototypeDB.enabled.bank==true)
filters.search:SetText('[no-match]')
for _,row in ipairs(filters.rows) do assert(not row:IsShown()) end
filters.search:SetText('')
assert(filters.scroll.maxValue>0)
filters.scroll:SetValue(3); assert(filters.scroll.value==3)
filters.defaults.scripts.OnClick()
for _,c in ipairs(NS.Data.categories) do assert(WFM_MapPrototypeDB.enabled[c.id]==c.enabled) end
local visibleBefore=0
for _,row in ipairs(filters.rows) do if row:IsShown() then visibleBefore=visibleBefore+1 end end
UIParent:SetHeight(220); filters:UpdateLayout()
local visibleAfter=0
for _,row in ipairs(filters.rows) do if row:IsShown() then visibleAfter=visibleAfter+1 end end
assert(visibleAfter>0 and visibleAfter<visibleBefore)
''')

    def test_filter_export_matches_desktop_quest_and_trainer_rules(self):
        script = """
import {readFile} from 'node:fs/promises';
import * as c from './dist/addon-prototype/map-config-runtime.mjs';
const en=JSON.parse(await readFile('src/i18n/locales/en.json','utf8'));
const t=k=>k?.split('.').reduce((v,p)=>v?.[p],en);
const points=(await Promise.all(c.MAP_DEFINITIONS.find(d=>d.id==='azeroth').locationFiles.map(async f=>JSON.parse(await readFile('public/maps/world-atlas/'+f,'utf8')).locations))).flat();
const aliases=new Set(points.flatMap(p=>p.aliasIds??[]));
const rows=c.FILTER_CATEGORY_ROWS.flatMap(({category,ids})=>c.TRAINER_CATEGORIES.includes(category.id)
 ? c.TRAINER_FILTER_IDS[category.id].map(id=>({id:c.trainerFilterKey(category.id,id),ids:[c.trainerFilterKey(category.id,id)]}))
 : [{id:category.id,ids}]);
const mapping=new Map(rows.flatMap(r=>r.ids.map(id=>[id,r.id])));
const expected={};
for(const p of points) {
 if(expected[p.id] || aliases.has(p.id) || p.hiddenFromMap || c.REMOVED_MAP_CATEGORY_IDS.has(p.category) || c.isLinkedQuestOfferPoint(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
 const trainer=c.getTrainerFilterKey({...p,label:t(p.labelKey)??p.label??'',trainerClass:t(p.trainerClassKey)??p.trainerClass,trainerTitle:t(p.trainerTitleKey)??p.trainerTitle});
 const ids=[...new Set((trainer?[trainer]:c.getPointFilterCategories(p)).map(id=>mapping.get(id)).filter(Boolean))];
 if(ids.length) expected[p.id]=ids;
}
console.log(JSON.stringify(expected));
"""
        expected=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
        markers=REPORT['data']['markers']
        self.assertEqual({m['id']:m['filterIds'] for m in markers},expected)
        ids={c['id'] for c in REPORT['data']['categories']}
        self.assertTrue({'npc','dungeon-quest','repeatable-quest','bank'} <= ids)
        self.assertFalse(ids & {'quest','quest-area','point-of-interest','bank-sign','class-trainer','profession-trainer'})
        self.assertIn('class-trainer:mage',ids)
        self.assertIn('profession-trainer:weapon-master',ids)
        self.assertTrue(any(len(m['filterIds'])>1 for m in markers))
        for category in REPORT['data']['categories']:
            keys={m['countKey'] for m in markers if category['id'] in m['filterIds']}
            self.assertEqual(category['count'],len(keys))
            self.assertGreater(category['count'],0)

    def test_filter_migration_and_multi_kind_giver_visibility(self):
        for _,lua in self.runtimes():
            lua.execute('''
WFM_MapPrototypeDB={enabled={quest=true,['class-trainer']=false,['bank-sign']=false},expanded={progression=false}}
for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,'ADDON_LOADED','wfm-map-prototype') end end
assert(WFM_MapPrototypeDB.enabled.quest==nil and not WFM_MapPrototypeDB.enabled.bank)
assert(not WFM_MapPrototypeDB.enabled['class-trainer:mage'] and not WFM_MapPrototypeDB.expanded.progression)
local m={id='giver',x=500,y=500,sprite='npc',category='npc',priority=1,filterIds={'npc','dungeon-quest'}}
local grid=NS.Core.Index({m}); local state={cx=500,cy=500,zoom=1,enabled={quest=true}}
assert(#NS.Core.Visible(grid,state,410,370)==0)
state.enabled['dungeon-quest']=true; assert(#NS.Core.Visible(grid,state,410,370)==1)
state.enabled.npc=true; local visible=NS.Core.Visible(grid,state,410,370)
assert(#visible==1 and visible[1].count==1, 'A multi-kind giver must remain a single pin')
state.enabled.npc=false; state.enabled['dungeon-quest']=false
assert(#NS.Core.Visible(grid,state,410,370)==0)
local filters
for _,f in ipairs(frames) do if f.search and f.rows then filters=f end end
local root=WFMMapPrototypeFrame
root.left=100; root.bottom=100; root:Show(); filters:Show()
assert(filters.layout.left==root.left+root:GetWidth()+8 and filters:GetHeight()==600)
filters.search:SetText(NS.Data.groups[1].label)
local rightColumn=false
for _,row in ipairs(filters.rows) do if row:IsShown() and not row.item.isGroup and row.point[2]>0 then rightColumn=true end end
assert(rightColumn)
UIParent:SetWidth(1280); root.left=316; root:SetWidth(680)
root.scripts.OnUpdate(root,0.1)
assert(filters:GetWidth()==300 and filters.layout.left+filters:GetWidth()==root.left-8)
for _,row in ipairs(filters.rows) do if row:IsShown() then assert(row.point[2]==0) end end
filters.clearSearch.scripts.OnClick(); assert(filters.search:GetText()=='' and not filters.clearSearch:IsShown())
root:Hide(); assert(not filters:IsShown())
''')

    def test_shortcut_conflicts_combat_and_layout_migration(self):
        binding = ET.parse(PACKAGE / 'Bindings.xml').getroot().find('Binding')
        self.assertEqual(binding.attrib['name'], 'WFM_MAP_PROTOTYPE_TOGGLE')
        for _, lua in self.runtimes():
            lua.execute('''
function event(name)
 for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,name,'wfm-map-prototype') end end
end
WFM_MapPrototypeDB={width=1040,height=720,enabled={bank=false}}
event('ADDON_LOADED')
assert(WFMMapPrototypeFrame:GetWidth()==410 and WFMMapPrototypeFrame:GetHeight()==370)
assert(WFM_MapPrototypeDB.enabled.bank==false and WFM_MapPrototypeDB.layoutVersion==2)
combat=true; event('PLAYER_LOGIN'); assert(not bindings['ALT-M'])
combat=false; event('PLAYER_REGEN_ENABLED'); assert(bindings['ALT-M']=='WFM_MAP_PROTOTYPE_TOGGLE' and savedBindings==1)
-- A user's later unbinding must persist across subsequent login events.
bindings={}; event('PLAYER_LOGIN'); assert(not bindings['ALT-M'])
WFM_MapPrototypeDB.bindingInitialized=nil; bindings['ALT-M']='EXISTING_ACTION'; event('PLAYER_LOGIN')
assert(bindings['ALT-M']=='EXISTING_ACTION' and savedBindings==1)
WFM_MapPrototypeDB.bindingInitialized=nil; bindings={['CTRL-SHIFT-M']='WFM_MAP_PROTOTYPE_TOGGLE'}; event('PLAYER_LOGIN')
assert(not bindings['ALT-M'] and savedBindings==1)
WFM_MapPrototypeDB.width=500; WFM_MapPrototypeDB.height=400; event('ADDON_LOADED')
assert(WFMMapPrototypeFrame:GetWidth()==500 and WFMMapPrototypeFrame:GetHeight()==400)
''')
            lua.execute(binding.text)
            self.assertTrue(lua.globals().WFMMapPrototypeFrame.IsShown(lua.globals().WFMMapPrototypeFrame))
            lua.execute(binding.text)
            self.assertFalse(lua.globals().WFMMapPrototypeFrame.IsShown(lua.globals().WFMMapPrototypeFrame))

    def test_details_switch_sides_and_stay_on_screen(self):
        for _, lua in self.runtimes():
            lua.execute('''
local layout=NS.Core.DetailLayout
assert(layout(100,100,410,370,1920,1080).mode=='right')
assert(layout(1486,24,410,370,1920,1080).mode=='left')
assert(layout(100,100,720,340,1920,1080).mode=='inside')
assert(layout(100,100,719,340,1920,1080).mode=='right')
assert(layout(0,24,700,300,720,1080).mode=='above')
assert(layout(0,600,700,300,720,1080).mode=='below')
for _,screen in ipairs({{1920,1080},{1280,720},{800,600}}) do
 for _,size in ipairs({{240,200},{410,370},{720,340},{800,600}}) do
  local w,h=math.min(size[1],screen[1]-16),math.min(size[2],screen[2]-16)
  for _,left in ipairs({0,(screen[1]-w)/2,screen[1]-w}) do
   for _,bottom in ipairs({0,screen[2]-h}) do
    local p=layout(left,bottom,w,h,screen[1],screen[2])
    assert(p.left>=8 and p.bottom>=8 and p.left+p.width<=screen[1]-8 and p.bottom+p.height<=screen[2]-8)
    if p.mode=='right' then assert(p.left>=left+w+8)
    elseif p.mode=='left' then assert(p.left+p.width<=left-8)
    elseif p.mode=='above' then assert(p.bottom>=bottom+h+8)
    elseif p.mode=='below' then assert(p.bottom+p.height<=bottom-8) end
   end
  end
 end
end
''')

    def test_details_content_selection_scroll_and_close(self):
        for _, lua in self.runtimes():
            lua.execute('''
local root=WFMMapPrototypeFrame
for _,f in ipairs(frames) do if f.scripts.OnEvent then f.scripts.OnEvent(f,'ADDON_LOADED','wfm-map-prototype') end end
root.left=100; root.bottom=100; root:Show(); root.scripts.OnUpdate(root,.1)
local card,marker,filterButton
for _,f in ipairs(frames) do
 if f.SetMarker then card=f end
 if f.key and f.item and f:IsShown() then marker=f end
 if f.tooltip==NS.Data.strings.filters then filterButton=f end
end
assert(card and marker and filterButton)
marker.scripts.OnMouseDown(marker,'LeftButton'); marker.scripts.OnMouseUp(marker,'LeftButton')
assert(card:IsShown() and card.marker and card.layout.mode=='right')
root.left=1450; card:UpdateLayout(); assert(card.layout.mode=='left')
root.left=100; root:SetSize(800,600); card:UpdateLayout(); assert(card.layout.mode=='inside')
local p={id='long',name='Long title',categoryLabel='Quest',region='Test',sprite=card.marker.sprite,
 details={coordinates={x=12.34,y=56.78},level=20,description=string.rep('Long description. ',400)}}
card:SetMarker(p)
assert(string.find(card.blocks[1].text,'12.3, 56.8',1,true))
assert(card.scrollbar:IsShown() and card.scrollbar.maxValue>0)
card.scripts.OnMouseWheel(card,-3); assert(card.scrollOffset>0)
card:SetMarker(marker.item.marker); assert(card.scrollOffset==0)
filterButton.scripts.OnClick(); assert(not card:IsShown() and card.marker==nil)
card:SetMarker(p); root:Hide(); assert(not card:IsShown() and card.marker==nil)
local escaped=NS.Core.DetailText({categoryLabel='A',details={description='|Hfake|h'}},NS.Data.strings)
assert(string.find(escaped,'||Hfake||h',1,true))
''')
        quests = json.loads((ROOT / 'public/data/quests/quest-details.json').read_text(encoding='utf-8'))['quests']
        self.assertFalse(any(m['id'] == 'forever-all-quest-93429-forever-all-quest-giver-254775-1' for m in REPORT['data']['markers']))
        if quests.get('93429', {}).get('description'):
            self.assertIn(quests['93429']['description'], [s['text'] for s in REPORT['data']['documents']['quest:93429']['sections']])

    def test_catalog_details_preserve_lists_and_resolve_navigation(self):
        data=REPORT['data']; documents=data['documents']; markers={m['id']:m for m in data['markers']}
        ruins=markers['mapgenie-instance-949838']['detailSections']
        bosses=next(s for s in ruins if s['title']=='Bosses and loot')['links']
        self.assertEqual(len(bosses),7)
        self.assertIn('Witherfang',[b['label'] for b in bosses])
        self.assertTrue(any('south of Brill' in s['text'] for s in ruins))
        for boss in bosses:
            self.assertTrue(next(s for s in documents[boss['target']]['sections'] if s['title']=='Loot')['links'])
        vendor=json.loads((ROOT/'public/data/vendors/inventories.json').read_text())
        checked=0
        for marker_id,npc in vendor['markers'].items():
            if marker_id not in markers: continue
            inventory=next(s for s in markers[marker_id]['detailSections'] if s['title']=='Vendor inventory')
            self.assertEqual([l['target'] for l in inventory['links']],[f"item:{i['id']}" for i in vendor['vendors'][npc]])
            checked+=1
        self.assertGreater(checked,100)
        rare=markers['forever-all-rare-5808-1']
        original=next(r for r in json.loads((ROOT/'public/data/rares/details.json').read_text())['entries'] if r['id']==5808)
        drops=next(s for s in rare['detailSections'] if s['title']=='Loot')['links']
        self.assertEqual(len(drops),len(original['drops']))
        self.assertIn('7.23%',drops[0]['meta'])
        npc=markers['forever-all-quest-giver-254775-1']
        self.assertIn('quest:93429',[l['target'] for s in npc['detailSections'] for l in s['links']])
        catalog=json.loads((ROOT/'public/data/quests/quest-details.json').read_text())['quests']
        for qid in ['5','93429']:
            if f'quest:{qid}' not in documents: continue
            for field in ['objective','description','progressText','completionText']:
                if catalog[qid].get(field):
                    self.assertIn(catalog[qid][field],[s['text'] for s in documents[f'quest:{qid}']['sections']])
        for owner in [*markers.values(),*documents.values()]:
            for section in owner.get('detailSections',owner.get('sections',[])):
                self.assertNotIn('undefined',section['text'])
                for link in section['links']:
                    self.assertTrue(link['label'])
                    target=link['target']
                    if target.startswith('marker:'): self.assertIn(target[7:],markers)
                    elif target: self.assertIn(target,documents)

    def test_soboz_loot_replaces_general_at_the_same_scroll_position(self):
        for _, lua in self.runtimes():
            lua.execute('''
local card, soboz
for _,frame in ipairs(frames) do if frame.SetMarker then card=frame end end
for _,marker in ipairs(NS.Data.markers) do
 if marker.id=='forever-all-rare-204070-4' then soboz=marker; break end
end
WFMMapPrototypeFrame:Show()
card:SetMarker(soboz)
local function visibleText()
 local text={}
 for _,frame in ipairs(frames) do
  if frame.kind=='FontString' and frame:IsShown() and
     (frame.parent==card.content or (frame.parent.parent==card.content and frame.parent:IsShown())) then
   text[#text+1]=frame:GetText()
  end
 end
 return table.concat(text,' ')
end
for i=1,2 do
 assert(card.scrollbar:GetValue()==0)
 card.tabButtons[2].scripts.OnClick(card.tabButtons[2])
 assert(card.selectedTab=='loot' and card.scrollbar:GetValue()==0)
 assert(visibleText():find('Rune of Grace',1,true), 'Loot must paint even when the scrollbar value does not change')
 assert(not visibleText():find('52.9, 73.9',1,true), 'General text remained visible in Loot')
 card.tabButtons[1].scripts.OnClick(card.tabButtons[1])
 assert(visibleText():find('52.9, 73.9',1,true) and not visibleText():find('Rune of Grace',1,true))
end
''')

    def test_detail_tabs_preserve_content_and_back_navigation(self):
        for _,lua in self.runtimes():
            lua.execute('''local L=NS.Data.strings
local sections={{title='Long',text=string.rep('é',2200),links={},tab='overview'},
 {title=L.detailInventory,text='',links={},tab='inventory'}}
for i=1,1000 do sections[2].links[i]={label='Item '..i,target='item:'..i,meta=''} end
local tabs=NS.Core.DetailTabs(sections,L); local count,characters=0,0
assert(#tabs==2 and tabs[1].id=='overview' and tabs[2].id=='inventory')
for _,tab in ipairs(tabs) do
 for _,block in ipairs(NS.Core.DetailBlocks(tab,L)) do
  if block.entry then count=count+1; assert(block.entry.label=='Item '..count)
  else local _,n=block.text:gsub('é',''); characters=characters+n end
 end
end
assert(count==1000 and characters==2200)
local root=WFMMapPrototypeFrame; root.left=100; root.bottom=100; root:Show()
local card,ruins,rare,vendor,quest
for _,f in ipairs(frames) do
 if f.SetMarker then card=f end
 assert(f.tooltip~=L.showOnMap, 'Removed action must not be instantiated')
end
for _,m in ipairs(NS.Data.markers) do
 if m.id=='mapgenie-instance-949838' then ruins=m end
 if m.id=='forever-all-rare-5808-1' then rare=m end
 for _,s in ipairs(m.detailSections or {}) do
  if s.tab=='inventory' then vendor=m end
  if s.tab=='rewards' then quest=m end
 end
end
-- Quest records are nested documents, never standalone exported map pins.
for _,doc in pairs(NS.Data.documents) do
 for _,section in ipairs(doc.sections) do
  if section.tab=='rewards' then quest={id='quest-document-fixture',name=doc.title,sprite=ruins.sprite,detailSections=doc.sections}; break end
 end
 if quest then break end
end
assert(ruins and rare and vendor and quest)
card:SetMarker(ruins)
assert(#card.tabs==3 and card.tabs[1].id=='overview' and card.tabs[2].id=='bosses' and card.tabs[3].id=='quests')
assert(not card.back:IsShown() and card.nextPage==nil and card.previousPage==nil)
assert(card.scroll.kind=='Frame', 'Virtualized tabs must not use a cached ScrollFrame surface')
for i=1,3 do
 card:SelectTab('quests')
 local shown=0
 for _,r in ipairs(card.linkRows) do
  if r:IsShown() then assert(r.entry.target:sub(1,6)=='quest:'); shown=shown+1 end
 end
 assert(shown>0, 'Tab content must appear before any scroll event')
 card:SelectTab('overview')
 for _,r in ipairs(card.linkRows) do assert(not r:IsShown(), 'Old tab links remained visible') end
end
card:SelectTab('bosses'); assert(card.selectedTab=='bosses')
card.scrollbar:SetValue(36); local priorOffset=card.scrollOffset
local bossLink
for _,row in ipairs(card.linkRows) do if row:IsShown() and row.entry.target:sub(1,5)=='boss:' then bossLink=row; break end end
assert(bossLink); bossLink.scripts.OnClick(bossLink); assert(card.back:IsShown())
card:SelectTab('loot'); assert(card.selectedTab=='loot')
local itemLink
for _,row in ipairs(card.linkRows) do if row:IsShown() and row.entry.target:sub(1,5)=='item:' then itemLink=row; break end end
assert(itemLink); itemLink.scripts.OnClick(itemLink)
assert(card.back:IsShown()); card.back.scripts.OnClick(); assert(card.back:IsShown() and card.selectedTab=='loot')
card.back.scripts.OnClick(); assert(not card.back:IsShown())
assert(card.marker.id==ruins.id and card.selectedTab=='bosses' and card.scrollOffset==priorOffset)
for _,sample in ipairs({{rare,'loot'},{vendor,'inventory'},{quest,'rewards'}}) do
 card:SetMarker(sample[1]); card:SelectTab(sample[2]); assert(card.selectedTab==sample[2])
end
-- A thousand entries stay scrollable, with every row reachable and a bounded pool.
card:SetMarker({id='large',name='Large inventory',sprite=ruins.sprite,details={},detailSections=sections})
card:SelectTab('inventory')
local entries=0; for _,block in ipairs(card.blocks) do if block.entry then entries=entries+1 end end
assert(entries==1000)
local seen={}
for pos=0,card.scrollbar.maxValue+100,100 do
 card.scrollbar:SetValue(pos)
 for _,row in ipairs(card.linkRows) do if row:IsShown() then seen[row.entry.label]=true end end
end
for i=1,1000 do assert(seen['Item '..i], 'Missing inventory row '..i) end
assert(#card.linkRows<30 and card.content:GetHeight()<500)
local savedOffset=card.scrollOffset
card:SelectTab('overview'); assert(card.scrollOffset==0)
card:SelectTab('inventory'); assert(card.scrollOffset==savedOffset)
-- Shrinking/repositioning the map preserves selection and clamps scrolling.
root:SetSize(240,200); card:UpdateLayout(); assert(card.selectedTab=='inventory')
assert(card.scrollOffset<=card.scrollbar.maxValue)
card:SetMarker({id='simple',name='Simple',sprite=ruins.sprite,details={description='Single description'}})
assert(#card.tabs==1 and not card.tabButtons[1]:IsShown() and card.scrollOffset==0)
''')


if __name__ == '__main__':
    unittest.main(verbosity=2)
