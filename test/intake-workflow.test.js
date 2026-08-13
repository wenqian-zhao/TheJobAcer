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

async function ndjson(response) {
  assert.ok(response.ok, `unexpected stream status ${response.status}`);
  const events = (await response.text()).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const failure = events.find((event) => event.type === 'error');
  assert.equal(failure, undefined, failure?.error);
  const complete = events.find((event) => event.type === 'complete');
  assert.ok(complete?.state, 'generation stream should finish with project state');
  return { events, state: complete.state };
}

test('saves mixed intake into job and decomposed personal information and generates an independent CV project', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-studio-intake-'));
  const applicationWorkspace = path.join(temporaryRoot, 'workspace');
  await fs.mkdir(applicationWorkspace, { recursive: true });
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
      fields: { profile: { name: '简·赵', email: 'jane@example.com', summary: '构建可靠的数据系统。', isPhoto: true }, personal: { category: 'profile' } },
    });
    classified.segments.push({
      kind: 'personal', title: 'Analytics Platform', summary: 'Selected project', content: 'Built an analytics platform.', confidence: .95,
      fields: { projects: [{ dates: '2024', name: 'Analytics Platform', role: 'Lead', bullets: ['Built an analytics platform.'] }], personal: { category: 'project' } },
    }, {
      kind: 'personal', title: 'Internal Portal', summary: 'Unselected project', content: 'Built an internal portal.', confidence: .95,
      fields: { projects: [{ dates: '2023', name: 'Internal Portal', role: 'Engineer', bullets: ['Built an internal portal.'] }], personal: { category: 'project' } },
    }, {
      kind: 'job', title: 'Analytics Platform Engineer', summary: 'Second selected role', content: 'Build reliable analytics platforms.', confidence: .97,
      fields: { job: { title: 'Analytics Platform Engineer', company: 'Example Labs', description: 'Build reliable analytics platforms.', requirements: ['Platform reliability'], keywords: ['analytics', 'platform'] } },
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
    assert.deepEqual(committed.bank.counts, { job: 2, personal: 5 });
    const storedBank = JSON.parse(await fs.readFile(path.join(applicationWorkspace, '.cvstudio-bank', 'bank.json'), 'utf8'));
    assert.equal(storedBank.submissions[0].rawHtml, '<p>Mixed source material</p>');
    assert.deepEqual(storedBank.assets.map((asset) => asset.name), ['profile.png', 'portfolio.pdf']);
    assert.ok(storedBank.items.every((item) => item.extractionStatus === 'extracted'));
    assert.ok(storedBank.items.every((item) => item.status === 'active'));
    assert.ok(storedBank.items.every((item) => item.recordedAt === item.createdAt));
    assert.ok(storedBank.items.every((item) => item.kind !== 'cv'));
    const bank = await json(await fetch(`${embedded.url}/api/intake/bank`));
    const jobs = bank.items.filter((item) => item.kind === 'job');
    assert.equal(jobs.length, 2);
    const personal = bank.items.find((item) => item.kind === 'personal' && item.assets?.length);
    const projects = bank.items.filter((item) => item.fields?.personal?.category === 'project');
    assert.equal(projects.length, 2);
    assert.ok(projects.every((item) => item.fields.projects.length === 1));
    assert.ok(bank.items.every((item) => item.status === 'active' && item.recordedAt));
    assert.equal(personal.assets[0].mimeType, 'image/png');

    const missingSelection = await fetch(`${embedded.url}/api/intake/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'missing-selection' }),
    });
    assert.equal(missingSelection.status, 400);
    assert.match((await missingSelection.json()).error, /at least one personal information item/i);

    const emptySelection = await fetch(`${embedded.url}/api/intake/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'empty-selection', itemIds: [] }),
    });
    assert.equal(emptySelection.status, 400);
    assert.match((await emptySelection.json()).error, /at least one personal information item/i);

    const selectedProject = projects.find((item) => item.fields.projects[0]?.name === 'Analytics Platform');
    assert.ok(selectedProject);
    const selectedPersonalItemIds = [personal.id, selectedProject.id];
    const selectedItemIds = [...selectedPersonalItemIds, ...jobs.map((item) => item.id)];
    const streamed = await ndjson(await fetch(`${embedded.url}/api/intake/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({ name: 'jane-data-cv', fitLevel: 'strict', templateId: 'sidebar', itemIds: selectedItemIds, provider: { type: 'local' } }),
    }));
    const generated = streamed.state;
    const generatedRoot = path.join(applicationWorkspace, 'generated-cvs', 'jane-data-cv');
    assert.ok(streamed.events.some((event) => event.type === 'progress' && event.phase === 'local'));
    assert.ok(streamed.events.some((event) => event.type === 'progress' && event.phase === 'compile'));
    assert.ok(streamed.events.some((event) => event.type === 'progress' && event.phase === 'save'));
    assert.equal(streamed.events.at(-1).type, 'complete');
    assert.equal(generated.root, generatedRoot);
    assert.equal(generated.entry, 'resume.tex');
    assert.deepEqual(new Set(generated.generatedFrom), new Set(selectedPersonalItemIds));
    assert.deepEqual(new Set(generated.selectedJobs), new Set(jobs.map((item) => item.id)));
    assert.deepEqual(new Set(generated.targetJobs), new Set(jobs.map((item) => item.id)));
    assert.equal(generated.fitLevel, 'strict');
    assert.equal(generated.savedByApp, true);
    assert.equal(generated.template.id, 'sidebar');
    assert.equal(generated.template.license, 'LPPL-1.3+');
    assert.equal(generated.template.photoRendered, true);
    assert.match(await fs.readFile(path.join(generatedRoot, 'resume.tex'), 'utf8'), /简·赵/);
    assert.match(await fs.readFile(path.join(generatedRoot, 'resume.tex'), 'utf8'), /Analytics Platform/);
    assert.doesNotMatch(await fs.readFile(path.join(generatedRoot, 'resume.tex'), 'utf8'), /Internal Portal/);
    const generatedSource = JSON.parse(await fs.readFile(path.join(generatedRoot, 'source-data.json'), 'utf8'));
    assert.equal(generatedSource.generation.fitLevel, 'strict');
    assert.equal(generatedSource.generation.templateId, 'sidebar');
    assert.equal(generatedSource.generation.photo.rendered, true);
    assert.equal(generatedSource.targetJobs.length, 2);
    assert.match(await fs.readFile(path.join(generatedRoot, 'README.md'), 'utf8'), /AltaCV/);
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
      body: JSON.stringify({ name: 'jane-general-cv', fitLevel: 'none', templateId: 'banking', itemIds: selectedItemIds, provider: { type: 'local' } }),
    }));
    const secondRoot = path.join(applicationWorkspace, 'generated-cvs', 'jane-general-cv');
    assert.equal(secondGenerated.root, secondRoot);
    assert.equal(secondGenerated.fitLevel, 'none');
    assert.equal(secondGenerated.template.id, 'banking');
    assert.equal(secondGenerated.template.photoAvailable, true);
    assert.equal(secondGenerated.template.photoRendered, false);
    assert.deepEqual(secondGenerated.targetJobs, []);
    assert.notEqual(secondGenerated.root, generated.root);
    assert.ok((await fs.stat(path.join(generatedRoot, 'resume.tex'))).isFile());
    assert.ok((await fs.stat(path.join(secondRoot, 'resume.tex'))).isFile());
    const generalSource = JSON.parse(await fs.readFile(path.join(secondRoot, 'source-data.json'), 'utf8'));
    assert.deepEqual(generalSource.targetJobs, []);
    assert.deepEqual(generalSource.generation.targetJobIds, []);
    assert.equal(generalSource.generation.templateId, 'banking');
    assert.deepEqual(generalSource.generation.photo, { available: true, path: 'assets/profile.png', rendered: false });
    assert.doesNotMatch(await fs.readFile(path.join(secondRoot, 'resume.tex'), 'utf8'), /includegraphics/);
    assert.ok((await fs.stat(path.join(secondRoot, 'assets', 'profile.png'))).size > 0);
    assert.doesNotMatch(await fs.readFile(path.join(secondRoot, 'resume.tex'), 'utf8'), /Example Labs|Platform reliability|Responsibilities: build data products/);

    for (const templateId of ['classic', 'awesome']) {
      const extraGenerated = await json(await fetch(`${embedded.url}/api/intake/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `jane-${templateId}-cv`, fitLevel: 'balanced', templateId, itemIds: selectedItemIds, provider: { type: 'local' } }),
      }));
      assert.equal(extraGenerated.template.id, templateId);
      assert.equal(extraGenerated.generation.compile.ok, true);
      const extraSource = await fs.readFile(path.join(applicationWorkspace, 'generated-cvs', `jane-${templateId}-cv`, 'resume.tex'), 'utf8');
      assert.match(extraSource, /简·赵/);
    }
    const workspaceState = await json(await fetch(`${embedded.url}/api/project/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: applicationWorkspace, entry: 'resume.tex' }),
    }));
    assert.ok(workspaceState.files.every((file) => !file.path.startsWith('generated-cvs/')));

    const deleted = await json(await fetch(`${embedded.url}/api/intake/items/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemIds: projects.map((item) => item.id) }),
    }));
    assert.deepEqual(new Set(deleted.removed), new Set(projects.map((item) => item.id)));
    assert.deepEqual(deleted.bank.counts, { job: 2, personal: 3 });
    assert.ok(deleted.bank.items.every((item) => !projects.some((project) => project.id === item.id)));
  } finally {
    if (embedded?.server) await new Promise((resolve, reject) => embedded.server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
