import assert from 'node:assert/strict';
import test from 'node:test';
import { getCameraTransform, canPreviewCamera, MAP_CAMERA_SAFE_MARGIN_PX } from './map-camera-transform.ts';
import { thinGatheringPoints } from './map-gathering-density.ts';

test('preview maps world points to the exact final camera coordinates',()=>{
 const from={centerX:-3500,centerY:-1250,zoom:.07};
 for(const width of [500,1500,2560])for(const height of [600,1080]){
  for(const to of [{...from,centerX:-3000}, {...from,zoom:.0854}, {centerX:-3320,centerY:-1400,zoom:.0574}]){
   const t=getCameraTransform(from,to,width,height);
   for(const [x,y] of [[0,0],[-4000,2000],[-3500,-1250]]){
    const previewX=((x-from.centerX)*from.zoom+width/2)*t.scale+t.left;
    const previewY=((y-from.centerY)*from.zoom+height/2)*t.scale+t.top;
    assert(Math.abs(previewX-((x-to.centerX)*to.zoom+width/2))<1e-8);
    assert(Math.abs(previewY-((y-to.centerY)*to.zoom+height/2))<1e-8);
   }
  }
 }
});

test('preview never exposes an undrawn edge or excessive raster enlargement',()=>{
 assert(canPreviewCamera({left:MAP_CAMERA_SAFE_MARGIN_PX,top:0,scale:1},1500,900));
 assert(!canPreviewCamera({left:MAP_CAMERA_SAFE_MARGIN_PX+1,top:0,scale:1},1500,900));
 assert(!canPreviewCamera({left:0,top:-MAP_CAMERA_SAFE_MARGIN_PX-1,scale:1},1500,900));
 assert(!canPreviewCamera({left:-50,top:-50,scale:1.5},1500,900));
 assert(!canPreviewCamera({left:0,top:0,scale:.5},1500,900));
});

test('ordinary place catalogs preserve the spatial index input through zoom',()=>{
 const points=[{id:'golf',category:'place-leisure',x:1,y:2}];
 for(const zoom of [.02,.07,.12,.34,.5])assert.equal(thinGatheringPoints(points,zoom,null),points);
});
