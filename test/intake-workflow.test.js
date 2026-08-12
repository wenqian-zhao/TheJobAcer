const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function json(response) {
  const body = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`);
  return body;
}

test('saves mixed intake into job and decomposed personal information and generates an independent CV project', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-studio-intake-'));
  const applicationWorkspace = path.join(temporaryRoot, 'workspace');
  const generatedParent = path.join(temporaryRoot, 'generated');
  await fs.mkdir(applicationWorkspace, { recursive: true });
  await fs.mkdir(generatedParent, { recursive: true });
  await fs.writeFile(path.join(applicationWorkspace, 'resume.tex'), '\\documentclass{article}\\begin{document}Seed\\end{document}');

  process.env.CV_STUDIO_ROOT_DIR = root;
  process.env.CV_STUDIO_WORKSPACE_DIR = applicationWorkspace;
  process.env.CV_STUDIO_TECTONIC_ROOT = path.join(root, 'vendor', 'tectonic');
  process.env.USE_BUNDLED_TECTONIC = '1';
  const { start } = require('../server');

  let embedded;
  try {
    embedded = await start({ port: 0 });
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    if (error?.code === 'EPERM') {
      t.skip('The current sandbox does not permit loopback listeners.');
      return;
    }
    throw error;
  }

  try {
    const classified = await json(await fetch(`${embedded.url}/api/intake/classify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: { type: 'local' },
        text: 'Jane Candidate\njane@example.com\nWork Experience\nBuilt analytics.\n\nJob Description\nResponsibilities: build data products.\nRequirements: SQL and Python.',
      }),
    }));
    assert.deepEqual(classified.segments.map((segment) => segment.kind), ['personal', 'personal', 'job']);
    assert.deepEqual(classified.segments.slice(0, 2).map((segment) => segment.fields.personal.category), ['profile', 'experience']);
    const rejected = await fetch(`${embedded.url}/api/intake/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          name: 'unreadable.png',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        }],
        segments: [{
          kind: 'personal', title: 'Unreadable screenshot', summary: 'Raw image only', content: '', confidence: .2,
          attachmentIndexes: [0], fields: { personal: { category: 'photo' } },
        }],
      }),
    });
    const rejectedBody = await rejected.json();
    assert.equal(rejected.status, 400);
    assert.match(rejectedBody.error, /还没有提取出可入库内容/);
    classified.segments.push({
      kind: 'personal',
      title: 'Profile photo',
      summary: 'Candidate photo',
      content: '',
      confidence: 1,
      attachmentIndexes: [0],
      fields: { profile: { name: 'Jane Candidate', email: 'jane@example.com', summary: 'Data professional.' }, personal: { category: 'photo' } },
    });
    const committed = await json(await fetch(`${embedded.url}/api/intake/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Mixed source material',
        html: '<p>Mixed source material</p>',
        attachments: [{
          name: 'profile.png',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        }, {
          name: 'portfolio.pdf',
          dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=',
        }],
        segments: classified.segments,
      }),
    }));
    assert.deepEqual(committed.bank.counts, { job: 1, personal: 3 });
    const storedBank = JSON.parse(await fs.readFile(path.join(applicationWorkspace, '.cvstudio-bank', 'bank.json'), 'utf8'));
    assert.equal(storedBank.submissions[0].rawHtml, '<p>Mixed source material</p>');
    assert.deepEqual(storedBank.assets.map((asset) => asset.name), ['profile.png', 'portfolio.pdf']);
    assert.ok(storedBank.items.every((item) => item.extractionStatus === 'extracted'));
    assert.ok(storedBank.items.every((item) => item.status === 'active'));
    assert.ok(storedBank.items.every((item) => item.recordedAt === item.createdAt));
    assert.ok(storedBank.items.every((item) => item.kind !== 'cv'));
    const bank = await json(await fetch(`${embedded.url}/api/intake/bank`));
    const job = bank.items.find((item) => item.kind === 'job');
    const personal = bank.items.find((item) => item.kind === 'personal' && item.assets?.length);
    assert.ok(bank.items.every((item) => item.status === 'active' && item.recordedAt));
    assert.equal(personal.assets[0].mimeType, 'image/png');

    const generated = await json(await fetch(`${embedded.url}/api/intake/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentPath: generatedParent, name: 'jane-data-cv', jobId: job.id }),
    }));
    const generatedRoot = path.join(generatedParent, 'jane-data-cv');
    assert.equal(generated.root, generatedRoot);
    assert.equal(generated.entry, 'resume.tex');
    assert.equal(generated.template.license, 'MIT');
    assert.match(await fs.readFile(path.join(generatedRoot, 'resume.tex'), 'utf8'), /Jane Candidate/);
    assert.match(await fs.readFile(path.join(generatedRoot, 'README.md'), 'utf8'), /geekplux\/cv_resume/);
    assert.ok((await fs.stat(path.join(generatedRoot, 'assets', 'profile.png'))).size > 0);
    const compiled = await json(await fetch(`${embedded.url}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: generated.entry,
        files: generated.files.filter((file) => file.editable).map((file) => ({ path: file.path, source: file.source })),
      }),
    }));
    assert.equal(compiled.ok, true);
    assert.ok((await fs.stat(path.join(generatedRoot, 'resume.pdf'))).size > 0);

    const secondGenerated = await json(await fetch(`${embedded.url}/api/intake/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentPath: generatedParent, name: 'jane-general-cv' }),
    }));
    const secondRoot = path.join(generatedParent, 'jane-general-cv');
    assert.equal(secondGenerated.root, secondRoot);
    assert.notEqual(secondGenerated.root, generated.root);
    assert.ok((await fs.stat(path.join(generatedRoot, 'resume.tex'))).isFile());
    assert.ok((await fs.stat(path.join(secondRoot, 'resume.tex'))).isFile());
  } finally {
    if (embedded?.server) await new Promise((resolve, reject) => embedded.server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
