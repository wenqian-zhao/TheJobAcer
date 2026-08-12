const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectProjectEntry,
  formatAgentProviderError,
  isEditableProjectFile,
  localResumeAgent,
  normalizeAgentResult,
  normalizeVisualContext,
  normalizeProjectPath,
  pdfPathForEntry,
  start,
} = require('../server');

test('starts the embedded service on an ephemeral loopback port', async (t) => {
  let embedded;
  try {
    embedded = await start({ port: 0 });
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('The current sandbox does not permit loopback listeners.');
      return;
    }
    throw error;
  }
  try {
    assert.ok(embedded.port > 0);
    assert.match(embedded.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${embedded.url}/api/project`);
    assert.equal(response.status, 200);
    const project = await response.json();
    assert.equal(project.entry, 'resume.tex');
  } finally {
    await new Promise((resolve, reject) => embedded.server.close((error) => error ? reject(error) : resolve()));
  }
});

test('turns provider failures into actionable Agent errors', () => {
  assert.match(formatAgentProviderError({ statusCode: 403, message: 'Forbidden' }, 'anthropic'), /权限.*Base URL/);
  assert.match(formatAgentProviderError({ statusCode: 429, message: 'rate limit' }, 'openai'), /稍后重试.*额度/);
  assert.match(formatAgentProviderError({ message: 'request timed out' }, 'openai'), /300 秒/);
});

test('normalizes safe project paths', () => {
  assert.equal(normalizeProjectPath('sections\\experience.tex'), 'sections/experience.tex');
  assert.equal(pdfPathForEntry('variants/product.tex'), 'variants/product.pdf');
});

test('validates bounded PDF visual context before it reaches a provider', () => {
  const context = normalizeVisualContext({
    page: 1,
    bounds: { x: .1, y: .2, width: .4, height: .3 },
    label: 'highlighted region 1',
    selectedText: 'Latency improved by 35%',
    imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  });

  assert.equal(context.mediaType, 'image/png');
  assert.equal(context.selectedText, 'Latency improved by 35%');
  assert.throws(() => normalizeVisualContext({
    page: 1,
    bounds: { x: .8, y: .2, width: .4, height: .3 },
    imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  }), /invalid bounds/);
  assert.throws(() => normalizeVisualContext({
    page: 1,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    imageDataUrl: 'data:text/plain;base64,aGVsbG8=',
  }), /PNG, JPEG, or WebP/);
});

test('rejects paths outside the project workspace', () => {
  assert.throws(() => normalizeProjectPath('../resume.tex'), /Invalid project file path/);
  assert.throws(() => normalizeProjectPath('sections/../../resume.tex'), /Invalid project file path/);
  assert.throws(() => normalizeProjectPath('/tmp/resume.tex'), /Invalid project file path/);
  assert.throws(() => normalizeProjectPath('resume.tex\0.txt'), /Invalid project file path/);
  assert.throws(() => normalizeProjectPath(''), /File path is required/);
});

test('classifies editable project sources and binary assets', () => {
  assert.equal(isEditableProjectFile('resume/main.tex'), true);
  assert.equal(isEditableProjectFile('awesome-cv.cls'), true);
  assert.equal(isEditableProjectFile('fonts/Roboto-Regular.ttf'), false);
  assert.equal(isEditableProjectFile('images/photo.png'), false);
});

test('detects the preferred LaTeX entry among multiple project files', async () => {
  const entry = await detectProjectEntry([
    { path: 'sections/experience.tex', editable: true, source: '\\section{Experience}' },
    { path: 'main.tex', editable: true, source: '\\documentclass{article}\\begin{document}Main\\end{document}' },
    { path: 'resume.tex', editable: true, source: '\\documentclass{article}\\begin{document}Resume\\end{document}' },
    { path: 'fonts/Roboto.ttf', editable: false, source: null },
  ]);
  assert.equal(entry, 'resume.tex');
});

test('local resume agent uses project context without an API key', () => {
  const result = localResumeAgent('如何拆分多个文件？', [
    { path: 'resume.tex', source: '\\input{sections/experience}' },
    { path: 'sections/experience.tex', source: '\\section*{Experience}' },
  ], 'resume.tex');

  assert.equal(result.mode, 'local');
  assert.match(result.response, /2 个可编辑文件/);
  assert.match(result.response, /sections\/experience\.tex/);
});

test('normalizes structured agent edits into reviewable patches', () => {
  const result = normalizeAgentResult({
    reply: 'Tightened the experience bullet.',
    edits: [{
      path: 'sections/experience.tex',
      source: '\\item Improved latency by 20\\%.',
      summary: 'Adds a measurable result.',
    }],
  }, [{ path: 'sections/experience.tex', source: '\\item Improved latency.' }], 'remote', 'test-model');

  assert.equal(result.response, 'Tightened the experience bullet.');
  assert.equal(result.edits.length, 1);
  assert.equal(result.edits[0].operation, 'update');
  assert.equal(result.edits[0].baseSource, '\\item Improved latency.');
  assert.match(result.edits[0].baseHash, /^[a-f0-9]{64}$/);
  assert.equal(result.edits[0].patch.hunks.length, 1);
});

test('drops unsafe or unchanged structured agent edits', () => {
  const result = normalizeAgentResult({
    reply: 'No safe changes.',
    edits: [
      { path: '../resume.tex', source: 'unsafe', summary: 'Unsafe path.' },
      { path: 'resume.tex', source: 'same', summary: 'No change.' },
      { path: 'script.js', source: 'alert(1)', summary: 'Unsupported file.' },
    ],
  }, [{ path: 'resume.tex', source: 'same' }], 'remote', 'test-model');

  assert.deepEqual(result.edits, []);
});

test('normalizes create and delete proposals while protecting the active entry file', () => {
  const result = normalizeAgentResult({
    reply: 'Project cleanup ready.',
    edits: [
      { operation: 'create', path: 'sections/new.tex', source: 'new', summary: 'Add section.' },
      { operation: 'delete', path: 'sections/old.tex', summary: 'Remove old section.' },
      { operation: 'delete', path: 'resume.tex', summary: 'Unsafe main deletion.' },
    ],
  }, [
    { path: 'resume.tex', source: 'main' },
    { path: 'sections/old.tex', source: 'old' },
  ], 'remote', 'test-model', 'resume.tex');

  assert.deepEqual(result.edits.map((edit) => edit.operation), ['create', 'delete']);
  assert.equal(result.edits[0].baseExists, false);
  assert.equal(result.edits[1].baseExists, true);
  assert.equal(result.edits[1].source, null);
  assert.ok(result.edits[1].patch.hunks.some((hunk) => hunk.lines.some((line) => line.startsWith('-'))));
});
