import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../public/ats/line3/layout.js', import.meta.url), 'utf8'), context);
const layout = context.window.LINE3_LAYOUT;
const dimensions = { width: 1280, height: 280, worldWidth: 30000, worldHeight: 960 };

test('invalid stored panel counts fall back to the single-panel layout', () => {
  for (const value of [undefined, null, 'invalid', 0, 4, 1.5, -2]) assert.equal(layout.normalizeRows(value), 1);
  for (const value of [1, 2, 3, '2']) assert.equal(layout.normalizeRows(value), Number(value));
});

test('stacked panels show consecutive ranges with matching vertical scale', () => {
  for (const rows of [1, 2, 3]) {
    const camera = layout.constrainCamera({ x: 1000, y: 0, w: 4000 }, { ...dimensions, rows });
    const boxes = Array.from({ length: rows }, (_, row) => layout.rowViewBox(camera, row));
    for (let row = 1; row < rows; row++) {
      assert.equal(boxes[row].x, boxes[row - 1].x + boxes[row - 1].w);
      assert.equal(boxes[row].y, boxes[0].y);
      assert.equal(boxes[row].h, boxes[0].h);
    }
    assert.equal(camera.w / camera.h, dimensions.width / dimensions.height);
  }
});

test('zoom keeps the asset under the pointer in any stacked panel', () => {
  const camera = { x: 1000, y: 50, w: 4000, h: 875 };
  for (let row = 0; row < 3; row++) {
    for (const factor of [.65, 1.28]) {
      const x = row + .3, y = .7;
      const zoomed = layout.zoomCamera(camera, factor, x, y);
      assert.ok(Math.abs(camera.x + x * camera.w - zoomed.x - x * zoomed.w) < 1e-8);
      assert.ok(Math.abs(camera.y + y * camera.h - zoomed.y - y * zoomed.h) < 1e-8);
    }
  }
});

test('panning near either end retains the line inside the combined panel range', () => {
  for (const rows of [1, 2, 3]) {
    const atStart = layout.constrainCamera({ x: -1e6, y: 0, w: 4000 }, { ...dimensions, rows });
    const atEnd = layout.constrainCamera({ x: 1e6, y: 0, w: 4000 }, { ...dimensions, rows });
    assert.ok(atStart.x <= 0 && atStart.x + atStart.w > 0);
    assert.ok(atEnd.x < dimensions.worldWidth);
    assert.ok(atEnd.x + atEnd.w * rows >= dimensions.worldWidth);
    assert.ok(atEnd.x + atEnd.w * rows <= dimensions.worldWidth + atEnd.w * .25);
  }
});
