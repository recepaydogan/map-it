import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarkerPainter } from './map-marker-painter.ts';

function fixture() {
  const calls = [];
  const context = new Proxy({}, {get: (_, key) => (...args) => calls.push([key, ...args])});
  const commands = Array.from({length:1000}, (_, i) => ({id:String(i), spriteKey:String(i),
    x:i < 3 ? i * 8 : i * 100, y:20, size:36, completed:i===1}));
  const sprites = new Map(commands.map(command => [command.id, {id:command.id}]));
  const paint = createMarkerPainter(context, commands, sprites, 100000, 100, 2);
  const draws = () => calls.filter(([key]) => key==='drawImage').map(([,sprite]) => sprite.id);
  return {calls, commands, sprites, context, paint, draws};
}

test('selection restores overlapping neighbors in order without redrawing distant pins', () => {
  const f=fixture();f.paint(null);assert.equal(f.draws().length,1000);f.calls.length=0;
  f.paint('0');assert.deepEqual(f.draws(),['1','2','0']);
  f.calls.length=0;f.paint('1');assert.deepEqual(f.draws(),['0','2','1']);
  f.calls.length=0;f.paint(null);assert.deepEqual(f.draws(),['0','1','2']);
});

test('isolated or already topmost selection needs no artwork repaint', () => {
  const f=fixture();f.paint(null);f.calls.length=0;
  for(const id of ['10','20','999',null,'2']) f.paint(id);
  assert.deepEqual(f.draws(),[]);
  assert.equal(f.calls.filter(([key])=>key==='clearRect').length,0);
});

test('sprite loads force a full refresh and retain selection on top', () => {
  const f=fixture();f.paint('0');f.calls.length=0;
  f.paint('0');assert.deepEqual(f.draws(),[]);
  f.paint('0',true);assert.equal(f.draws().length,1000);assert.equal(f.draws().at(-1),'0');
});

test('camera changes create a fresh surface even when selection is unchanged', () => {
  const f=fixture();f.paint('0');f.calls.length=0;
  const moved=f.commands.map(command=>({...command,x:command.x+1.25}));
  createMarkerPainter(f.context,moved,f.sprites,100000,100,2)('0');
  assert.equal(f.draws().length,1000);
  assert.equal(f.calls.filter(([key])=>key==='clearRect').length,1);
});

test('a background area pin remains below overlapping icons when selected or sprites reload', () => {
  const f=fixture();
  f.commands[0].raiseOnSelect=false;
  f.paint('0');assert.deepEqual(f.draws().slice(0,3),['0','1','2']);
  f.calls.length=0;f.paint(null);assert.deepEqual(f.draws(),[]);
  f.paint('0');assert.deepEqual(f.draws(),[]);
  f.paint('1');f.calls.length=0;f.paint('0');
  assert.deepEqual(f.draws(),['0','1','2']);
  f.calls.length=0;f.paint('0',true);
  assert.deepEqual(f.draws().slice(0,3),['0','1','2']);
  assert.equal(f.draws().length,1000);
});
