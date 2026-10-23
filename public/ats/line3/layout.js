(() => {
  'use strict';
  function normalizeRows(value) {
    return [1, 2, 3].includes(Number(value)) ? Number(value) : 1;
  }
  function constrainCamera(camera, { width, height, rows, worldWidth, worldHeight }) {
    rows = normalizeRows(rows);
    const w = Math.max(480, Math.min(worldWidth * 1.1 / rows, camera.w));
    const h = w * Math.max(1, height) / Math.max(1, width);
    const minX = -w * .25, maxX = Math.max(minX, worldWidth - w * (rows - .25));
    return {
      x: Math.max(minX, Math.min(maxX, camera.x)),
      y: Math.max(-h * .85, Math.min(worldHeight - h * .15, camera.y)),
      w, h,
    };
  }
  function rowViewBox(camera, row) {
    return { x: camera.x + camera.w * row, y: camera.y, w: camera.w, h: camera.h };
  }
  function zoomCamera(camera, factor, x, y) {
    const w = camera.w * factor, h = camera.h * factor;
    return { x: camera.x + x * (camera.w - w), y: camera.y + y * (camera.h - h), w, h };
  }
  window.LINE3_LAYOUT = Object.freeze({ normalizeRows, constrainCamera, rowViewBox, zoomCamera });
})();
