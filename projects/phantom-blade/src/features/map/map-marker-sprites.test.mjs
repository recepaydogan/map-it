import assert from "node:assert/strict";
import test from "node:test";
import { cacheMarkerArtwork, drawMarkerSprite } from "./map-marker-sprites.ts";

const renderer = () => {
  const draws = [];
  const context = {
    filter: "none",
    save() {},
    restore() {},
    drawImage(...args) { draws.push({ args, filter: this.filter }); },
  };
  return { context, draws };
};

test("enlarged native pins draw source artwork rather than an enlarged small sprite", () => {
  const { context, draws } = renderer();
  const sprite = { width: 36, height: 36 };
  const image = { naturalWidth: 256, naturalHeight: 256 };
  drawMarkerSprite(context, sprite, { image, size: 28, filter: "brightness(2.2)" }, 10, 20, 45);
  assert.strictEqual(draws[0].args[0], image);
  assert.deepEqual(draws[0].args.slice(1), [15, 25, 35, 35]);
  assert.equal(draws[0].filter, "brightness(2.2)");
});

test("native weapons retain their aspect ratio and stay centered", () => {
  const { context, draws } = renderer();
  const image = { naturalWidth: 128, naturalHeight: 256 };
  drawMarkerSprite(context, {}, { image, size: 28, filter: "none" }, 0, 0, 36);
  assert.deepEqual(draws[0].args, [image, 11, 4, 14, 28]);
});

test("creature badges keep their complete cached sprite", () => {
  const { context, draws } = renderer();
  const sprite = { width: 144, height: 144 };
  drawMarkerSprite(context, sprite, undefined, 10, 20, 27);
  assert.deepEqual(draws[0].args, [sprite, 10, 20, 27, 27]);
});

test("pickup brightness is applied once at full source resolution, never per pan paint", () => {
  const { context: cachedContext, draws: cacheDraws } = renderer();
  const cachedImage = { width: 0, height: 0, getContext: () => cachedContext };
  const image = { naturalWidth: 128, naturalHeight: 256 };
  const artwork = cacheMarkerArtwork(image, 28, "brightness(2.2)", () => cachedImage);
  assert.equal(cachedImage.width, 128);
  assert.equal(cachedImage.height, 256);
  assert.equal(cacheDraws.length, 1);
  assert.equal(cacheDraws[0].filter, "brightness(2.2)");
  assert.equal(artwork.filter, "none");
  const { context, draws } = renderer();
  context.save = () => assert.fail("An unfiltered cached image must not create a filter layer");
  for (let index = 0; index < 10; index++) drawMarkerSprite(context, {}, artwork, 0, 0, 36);
  assert.equal(cacheDraws.length, 1);
  assert.equal(draws.length, 10);
  assert.deepEqual(draws[0].args, [cachedImage, 11, 4, 14, 28]);
});

test("spatial filters keep their original output-space behavior", () => {
  const image = { naturalWidth: 256, naturalHeight: 256 };
  const artwork = cacheMarkerArtwork(image, 28, "drop-shadow(0 1px 3px black)", () => assert.fail("Do not pre-rasterize spatial filters"));
  assert.strictEqual(artwork.image, image);
  assert.equal(artwork.filter, "drop-shadow(0 1px 3px black)");
});
