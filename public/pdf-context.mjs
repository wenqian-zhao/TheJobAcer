export function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function boundsForPoints(points, minimumSize = 0.025) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = points.map((point) => clampUnit(point.x));
  const ys = points.map((point) => clampUnit(point.y));
  let left = Math.min(...xs);
  let top = Math.min(...ys);
  let right = Math.max(...xs);
  let bottom = Math.max(...ys);
  const widthGap = Math.max(0, minimumSize - (right - left));
  const heightGap = Math.max(0, minimumSize - (bottom - top));
  left = clampUnit(left - widthGap / 2);
  top = clampUnit(top - heightGap / 2);
  right = clampUnit(Math.max(right + widthGap / 2, left + minimumSize));
  bottom = clampUnit(Math.max(bottom + heightGap / 2, top + minimumSize));
  return {
    x: left,
    y: top,
    width: Math.max(.001, right - left),
    height: Math.max(.001, bottom - top),
  };
}

export function regionsIntersect(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

export function textForPdfRegion(items, bounds, limit = 5_000) {
  if (!Array.isArray(items) || !bounds) return '';
  return items
    .filter((item) => item?.text && regionsIntersect(item, bounds))
    .sort((first, second) => Math.abs(first.y - second.y) > .012 ? first.y - second.y : first.x - second.x)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function rotatePointClockwise(point) {
  return { x: clampUnit(1 - point.y), y: clampUnit(point.x) };
}
