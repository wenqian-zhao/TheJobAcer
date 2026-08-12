import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsForPoints, rotatePointClockwise, textForPdfRegion } from '../public/pdf-context.mjs';

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
