import assert from "node:assert/strict";
import { test } from "node:test";
import { placeTourPopover } from "./tour-popover-placement.ts";

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const inside = (card, content) => {
  assert.ok(card.left >= content.left + 12);
  assert.ok(card.top >= content.top + 12);
  assert.ok(card.right <= content.right - 12);
  assert.ok(card.bottom <= content.bottom - 12);
};
const size = { w: 340, h: 202 };

test("bottom-right marker control stays visible in the reported small window", () => {
  const content = box(0, 40, 500, 284);
  const target = box(450, 212, 48, 64);
  const card = placeTourPopover({ content, target, size, placement: "bottom" });
  inside(card, content);
  assert.ok(!overlaps(card, target));
  assert.ok(card.right <= target.left - 14, "Use the free space to the left instead of clamping over the control");
});

test("keeps the requested side when there is room", () => {
  const content = box(0, 40, 1000, 700);
  const target = box(100, 100, 60, 40);
  const card = placeTourPopover({ content, target, size, placement: "bottom" });
  assert.equal(card.top, target.bottom + 14);
  assert.equal(card.left, target.left);
});

test("flips above a bottom-edge control when horizontal space is unavailable", () => {
  const content = box(0, 40, 300, 500);
  const target = box(125, 470, 50, 50);
  const card = placeTourPopover({ content, target, size, placement: "bottom" });
  inside(card, content);
  assert.ok(card.bottom <= target.top - 14);
});

test("right placement flips left near the ad rail without crossing the content edge", () => {
  const content = box(30, 40, 800, 600);
  const target = box(740, 180, 60, 60);
  const card = placeTourPopover({ content, target, size, placement: "right" });
  inside(card, content);
  assert.ok(!overlaps(card, target));
  assert.ok(card.right <= target.left);
});

test("an open sidebar cannot push the card back onto its target", () => {
  const content = box(0, 40, 800, 600);
  const target = box(730, 550, 50, 50);
  const card = placeTourPopover({ content, target, size, placement: "bottom", avoid: [box(20, 70, 384, 550)] });
  inside(card, content);
  assert.ok(!overlaps(card, target));
  assert.ok(!overlaps(card, box(20, 70, 384, 550)));
});

test("a tall translated card is constrained to the map frame", () => {
  const content = box(20, 60, 500, 280);
  const card = placeTourPopover({ content, target: box(470, 250, 30, 50), size: { w: 340, h: 600 } });
  inside(card, content);
  assert.equal(card.maxHeight, 256);
  assert.ok(!overlaps(card, box(470, 250, 30, 50)));
});

test("untargeted introductory cards remain centered", () => {
  const content = box(20, 40, 800, 600);
  const card = placeTourPopover({ content, target: null, size, placement: "center" });
  assert.equal(card.left, content.left + (content.width - size.w) / 2);
  assert.equal(card.top, content.top + (content.height - size.h) / 2);
});

test("all preferred sides keep corner controls visible across desktop and small windows", () => {
  for (const [width, height] of [[500, 284], [800, 600], [360, 500], [1240, 680]]) {
    const content = box(20, 40, width, height);
    for (const x of [content.left + 12, content.right - 56]) {
      for (const y of [content.top + 12, content.bottom - 56]) {
        const target = box(x, y, 44, 44);
        for (const placement of ["bottom", "top", "left", "right"]) {
          const card = placeTourPopover({ content, target, size, placement });
          inside(card, content);
          assert.ok(!overlaps(card, target), `${width}x${height}, ${placement}, target ${x},${y}`);
        }
      }
    }
  }
});
