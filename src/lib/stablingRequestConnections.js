export function normalizeConnectionTrainId(value) {
  const match = String(value ?? "").trim().replace(/\s+/g, "").match(/^T?0*(\d+)$/i);
  return match ? `T${Number(match[1])}` : "";
}

export function getStablingRequestConnectionTrainIds(trainIds, hoveredTrainId) {
  if (hoveredTrainId === undefined) return trainIds;
  const wanted = normalizeConnectionTrainId(hoveredTrainId);
  return wanted ? trainIds.filter((train) => normalizeConnectionTrainId(train) === wanted) : [];
}

export function findStablingRequestTargets(workspace, trainIds) {
  const wanted = new Set(trainIds.map(normalizeConnectionTrainId).filter(Boolean));
  if (!workspace || !wanted.size) return [];
  return [...workspace.querySelectorAll("[data-stabling-train]")]
    .filter((card) => wanted.has(normalizeConnectionTrainId(card.dataset.stablingTrain)));
}

export function intersectConnectionRects(rect, clip) {
  const left = Math.max(rect.left, clip.left);
  const top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.right, clip.right);
  const bottom = Math.min(rect.bottom, clip.bottom);
  return right > left && bottom > top
    ? { left, top, right, bottom, width: right - left, height: bottom - top }
    : null;
}

export function getVisibleConnectionRect(element, viewport, getStyle = window.getComputedStyle) {
  let visible = intersectConnectionRects(element.getBoundingClientRect(), {
    left: 0, top: 0, right: viewport.width, bottom: viewport.height,
  });
  if (!visible) return null;
  const ownStyle = getStyle(element);
  if (ownStyle.display === "none" || ownStyle.visibility === "hidden") return null;
  for (let parent = element.parentElement; parent && visible; parent = parent.parentElement) {
    const style = getStyle(parent);
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const bounds = parent.getBoundingClientRect();
    visible = intersectConnectionRects(visible, {
      left: clipsX ? bounds.left : visible.left,
      right: clipsX ? bounds.right : visible.right,
      top: clipsY ? bounds.top : visible.top,
      bottom: clipsY ? bounds.bottom : visible.bottom,
    });
  }
  return visible;
}

export function buildStablingConnectionPath(source, target) {
  const toLeft = target.left + target.width / 2 < source.left + source.width / 2;
  const direction = toLeft ? -1 : 1;
  const start = { x: toLeft ? source.left - 3 : source.right + 3, y: source.top + source.height / 2 };
  const end = { x: toLeft ? target.right + 3 : target.left - 3, y: target.top + target.height / 2 };
  const bend = Math.max(24, Math.min(100, Math.abs(start.x - end.x) * 0.35));
  return {
    start, end,
    path: `M ${start.x} ${start.y} C ${start.x + direction * bend} ${start.y}, ${end.x - direction * bend} ${end.y}, ${end.x} ${end.y}`,
  };
}
