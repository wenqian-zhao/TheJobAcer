const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hashSource = (source) => crypto.createHash('sha256').update(source, 'utf8').digest('hex');

async function json(response) {
  const body = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`);
  return body;
}

test('completes the local desktop workflow with a nested multi-file project and binary asset', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-studio-workflow-'));
  const applicationWorkspace = path.join(temporaryRoot, 'application-workspace');
  const projectRoot = path.join(temporaryRoot, 'realistic-resume');

  await fs.mkdir(path.join(applicationWorkspace), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'sections'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'variants'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'assets'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.cvstudio-trash', 'old'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.cvstudio-bank', 'assets'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'sections', 'tmp'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'assets', 'nested', '.git'), { recursive: true });
  await fs.writeFile(path.join(applicationWorkspace, 'resume.tex'), '\\documentclass{article}\\begin{document}Seed\\end{document}');
  await fs.writeFile(path.join(projectRoot, 'resume.tex'), String.raw`\documentclass{article}
\begin{document}
\input{sections/experience}
\end{document}
`);
  await fs.writeFile(path.join(projectRoot, 'sections', 'experience.tex'), String.raw`\section*{Experience}
\begin{itemize}
\item Built a local-first resume editor used by 12 candidates.
\end{itemize}
`);
  await fs.writeFile(path.join(projectRoot, 'variants', 'compact.tex'), String.raw`\documentclass{article}
\begin{document}Compact resume\end{document}
`);
  await fs.writeFile(path.join(projectRoot, 'assets', 'portrait.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ));
  await fs.writeFile(path.join(projectRoot, '.git', 'config'), '[core]');
  await fs.writeFile(path.join(projectRoot, '.cvstudio-trash', 'old', 'removed.tex'), 'removed');
  await fs.writeFile(path.join(projectRoot, '.cvstudio-bank', 'bank.json'), '{"private":true}');
  await fs.writeFile(path.join(projectRoot, 'sections', 'tmp', 'draft.tex'), 'temporary draft');
  await fs.writeFile(path.join(projectRoot, 'assets', 'nested', '.git', 'config'), '[core]');

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
    const opened = await json(await fetch(`${embedded.url}/api/project/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projectRoot }),
    }));
    assert.equal(opened.entry, 'resume.tex');
    assert.deepEqual(opened.entries, ['resume.tex', 'variants/compact.tex']);
    assert.equal(opened.files.find((file) => file.path === 'assets/portrait.png').editable, false);
    assert.equal(opened.files.find((file) => file.path === 'sections/experience.tex').editable, true);

    const tailoredFiles = opened.files.filter((file) => file.editable).map((file) => ({
      path: file.path,
      source: file.path === 'sections/experience.tex'
        ? file.source.replace('12 candidates', '40 hiring teams')
        : file.source,
    }));
    const duplicated = await json(await fetch(`${embedded.url}/api/project/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parentPath: temporaryRoot,
        name: 'product-cv',
        entry: 'resume.tex',
        files: tailoredFiles,
      }),
    }));
    const duplicatedRoot = path.join(temporaryRoot, 'product-cv');
    assert.equal(duplicated.root, duplicatedRoot);
    assert.equal(duplicated.entry, 'resume.tex');
    assert.match(await fs.readFile(path.join(duplicatedRoot, 'sections', 'experience.tex'), 'utf8'), /40 hiring teams/);
    assert.deepEqual(
      await fs.readFile(path.join(duplicatedRoot, 'assets', 'portrait.png')),
      await fs.readFile(path.join(projectRoot, 'assets', 'portrait.png')),
    );
    await assert.rejects(fs.access(path.join(duplicatedRoot, '.git')));
    await assert.rejects(fs.access(path.join(duplicatedRoot, '.cvstudio-trash')));
    await assert.rejects(fs.access(path.join(duplicatedRoot, '.cvstudio-bank')));
    await assert.rejects(fs.access(path.join(duplicatedRoot, 'sections', 'tmp')));
    await assert.rejects(fs.access(path.join(duplicatedRoot, 'assets', 'nested', '.git')));

    const duplicateCollision = await fetch(`${embedded.url}/api/project/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentPath: temporaryRoot, name: 'product-cv', entry: 'resume.tex', files: tailoredFiles }),
    });
    assert.equal(duplicateCollision.status, 400);

    const reopenedOriginal = await json(await fetch(`${embedded.url}/api/project/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projectRoot, entry: 'variants/compact.tex' }),
    }));
    assert.equal(reopenedOriginal.root, projectRoot);
    assert.equal(reopenedOriginal.entry, 'variants/compact.tex');

    const created = await json(await fetch(`${embedded.url}/api/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'sections/skills.tex', source: '\\section*{Skills}\nNode.js, LaTeX' }),
    }));
    assert.equal(created.path, 'sections/skills.tex');

    await json(await fetch(`${embedded.url}/api/file`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'sections/skills.tex', source: '\\section*{Skills}\nNode.js, LaTeX, Electron' }),
    }));
    assert.match(await fs.readFile(path.join(projectRoot, 'sections', 'skills.tex'), 'utf8'), /Electron/);

    const experienceBefore = await fs.readFile(path.join(projectRoot, 'sections', 'experience.tex'), 'utf8');
    const experienceAfter = experienceBefore.replace('12 candidates', '24 candidates');
    await json(await fetch(`${embedded.url}/api/agent/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: 'resume.tex',
        edits: [{
          operation: 'update',
          path: 'sections/experience.tex',
          source: experienceAfter,
          baseExists: true,
          baseHash: hashSource(experienceBefore),
        }],
      }),
    }));
    assert.match(await fs.readFile(path.join(projectRoot, 'sections', 'experience.tex'), 'utf8'), /24 candidates/);

    const staleApply = await fetch(`${embedded.url}/api/agent/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: 'resume.tex',
        edits: [{
          operation: 'update',
          path: 'sections/experience.tex',
          source: experienceBefore,
          baseExists: true,
          baseHash: hashSource(experienceBefore),
        }],
      }),
    });
    assert.equal(staleApply.status, 409);

    const skillsSource = await fs.readFile(path.join(projectRoot, 'sections', 'skills.tex'), 'utf8');
    const deleted = await json(await fetch(`${embedded.url}/api/agent/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: 'resume.tex',
        edits: [{
          operation: 'delete',
          path: 'sections/skills.tex',
          baseExists: true,
          baseHash: hashSource(skillsSource),
        }],
      }),
    }));
    assert.equal(deleted.deleted[0].path, 'sections/skills.tex');
    await assert.rejects(fs.access(path.join(projectRoot, 'sections', 'skills.tex')));
    assert.equal(await fs.readFile(path.join(projectRoot, deleted.deleted[0].trashPath), 'utf8'), skillsSource);

    const entryDelete = await fetch(`${embedded.url}/api/agent/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: 'resume.tex',
        edits: [{ operation: 'delete', path: 'resume.tex', baseExists: true, baseHash: hashSource(await fs.readFile(path.join(projectRoot, 'resume.tex'), 'utf8')) }],
      }),
    });
    assert.equal(entryDelete.status, 400);
    await fs.access(path.join(projectRoot, 'resume.tex'));

    const compiled = await json(await fetch(`${embedded.url}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: opened.entry, files: opened.files.filter((file) => file.editable) }),
    }));
    assert.equal(compiled.pdfPath, 'resume.pdf');
    assert.match(compiled.compiler, /Tectonic/);
    const preview = await fetch(`${embedded.url}/preview.pdf?entry=resume.tex`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'application/pdf');
    assert.ok((await preview.arrayBuffer()).byteLength > 500);
    const pdfWorker = await fetch(`${embedded.url}/pdf.worker.min.mjs`);
    assert.equal(pdfWorker.status, 200);
    assert.match(pdfWorker.headers.get('content-type'), /text\/javascript/);
    assert.ok((await pdfWorker.arrayBuffer()).byteLength > 500_000);
    const pdfWasm = await fetch(`${embedded.url}/pdfjs/wasm/openjpeg.wasm`);
    assert.equal(pdfWasm.status, 200);
    assert.equal(pdfWasm.headers.get('content-type'), 'application/wasm');

    const questions = await json(await fetch(`${embedded.url}/api/interview/questions?role=technical`));
    assert.equal(questions.questions.length, 3);
    const feedback = await json(await fetch(`${embedded.url}/api/interview/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role: 'technical',
        question: questions.questions[0],
        answer: '背景：服务延迟过高。行动：我加入指标并重构缓存。结果：延迟降低 35%。复盘：之后补充压测。',
      }),
    }));
    assert.ok(feedback.score > 0);
    assert.ok(feedback.nextPrompt);

    const agent = await json(await fetch(`${embedded.url}/api/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: '建议如何拆分多个文件',
        entry: opened.entry,
        files: opened.files.filter((file) => file.editable),
        provider: { type: 'local' },
        visualContext: {
          page: 1,
          bounds: { x: .05, y: .1, width: .8, height: .2 },
          label: 'highlighted region 1',
          selectedText: 'Built a local-first resume editor used by 12 candidates.',
          imageDataUrl: 'data:image/jpeg;base64,YQ==',
        },
      }),
    }));
    assert.equal(agent.mode, 'local');
    assert.match(agent.response, /可编辑文件/);

    const persistedState = JSON.parse(await fs.readFile(path.join(applicationWorkspace, '.cvstudio.json'), 'utf8'));
    assert.equal(persistedState.root, projectRoot);
  } finally {
    await new Promise((resolve, reject) => embedded.server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
