import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsForPoints, rotatePointClockwise, textForPdfRegion, textLineForPdfItem } from '../public/pdf-context.mjs';

test('normalizes freehand PDF points into stable region bounds', () => {
  const bounds = boundsForPoints([{ x: .2, y: .3 }, { x: .6, y: .7 }]);
  assert.deepEqual(bounds, { x: .2, y: .3, width: .39999999999999997, height: .39999999999999997 });
  const clickBounds = boundsForPoints([{ x: .5, y: .5 }], .1);
  assert.ok(clickBounds.width >= .099);
  assert.ok(clickBounds.height >= .099);
});

test('extracts only PDF text that overlaps the selected visual region', () => {
  const text = textForPdfRegion([
    { text: 'Experience', x: .1, y: .1, width: .2, height: .04 },
    { text: 'Built 12 pipelines', x: .1, y: .4, width: .3, height: .04 },
    { text: 'Education', x: .1, y: .8, width: .2, height: .04 },
  ], { x: .05, y: .35, width: .5, height: .15 });
  assert.equal(text, 'Built 12 pipelines');
});

test('rotates annotation points with the rendered PDF page', () => {
  assert.deepEqual(rotatePointClockwise({ x: .2, y: .7 }), { x: .30000000000000004, y: .2 });
});

test('groups the clicked PDF item with only its contiguous visual line', () => {
  const items = [
    { text: 'Senior', x: .1, y: .2, width: .08, height: .02 },
    { text: 'Engineer', x: .19, y: .201, width: .11, height: .02 },
    { text: '2024', x: .72, y: .2, width: .06, height: .02 },
    { text: 'Different line', x: .1, y: .26, width: .2, height: .02 },
  ];

  const line = textLineForPdfItem(items, 1);

  assert.equal(line.text, 'Senior Engineer');
  assert.deepEqual(line.itemIndexes, [0, 1]);
  assert.ok(Math.abs(line.bounds.x - .1) < 0.0001);
  assert.ok(Math.abs(line.bounds.width - .2) < 0.0001);
});

test('returns no inline selection for invalid or blank PDF text items', () => {
  assert.equal(textLineForPdfItem([{ text: ' ', x: 0, y: 0, width: .1, height: .1 }], 0), null);
  assert.equal(textLineForPdfItem([], 0), null);
});
