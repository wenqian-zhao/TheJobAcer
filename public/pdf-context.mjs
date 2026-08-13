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

export function textLineForPdfItem(items, itemIndex, maximumGap = 0.035) {
  if (!Array.isArray(items) || !Number.isInteger(itemIndex) || !items[itemIndex]?.text?.trim()) return null;
  const target = items[itemIndex];
  const targetMiddle = target.y + target.height / 2;
  const candidates = items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.text?.trim()
      && Math.abs((item.y + item.height / 2) - targetMiddle) <= Math.max(target.height, item.height) * 0.72)
    .sort((first, second) => first.x - second.x);
  const targetPosition = candidates.findIndex((item) => item.index === itemIndex);
  if (targetPosition < 0) return null;
  let start = targetPosition;
  let end = targetPosition;
  while (start > 0) {
    const previous = candidates[start - 1];
    const current = candidates[start];
    if (current.x - (previous.x + previous.width) > maximumGap) break;
    start -= 1;
  }
  while (end < candidates.length - 1) {
    const current = candidates[end];
    const next = candidates[end + 1];
    if (next.x - (current.x + current.width) > maximumGap) break;
    end += 1;
  }
  const lineItems = candidates.slice(start, end + 1);
  const left = Math.min(...lineItems.map((item) => item.x));
  const top = Math.min(...lineItems.map((item) => item.y));
  const right = Math.max(...lineItems.map((item) => item.x + item.width));
  const bottom = Math.max(...lineItems.map((item) => item.y + item.height));
  const text = lineItems.map((item, index) => {
    if (!index) return item.text.trim();
    const previous = lineItems[index - 1];
    const gap = item.x - (previous.x + previous.width);
    return `${gap > 0.002 ? ' ' : ''}${item.text.trim()}`;
  }).join('').replace(/\s+/g, ' ').trim();
  return {
    text,
    itemIndexes: lineItems.map((item) => item.index),
    bounds: {
      x: clampUnit(left),
      y: clampUnit(top),
      width: Math.max(.001, clampUnit(right) - clampUnit(left)),
      height: Math.max(.001, clampUnit(bottom) - clampUnit(top)),
    },
  };
}

export function rotatePointClockwise(point) {
  return { x: clampUnit(1 - point.y), y: clampUnit(point.x) };
}
