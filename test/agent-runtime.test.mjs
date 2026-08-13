import test from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import {
  CV_FIT_POLICIES,
  CV_GENERATION_MAX_STEPS,
  CV_GENERATION_ROUNDS,
  RESUME_AGENT_MAX_STEPS,
  createResumeAgentTools,
  createVisualUserContent,
  resolveAgentModel,
  runCvGenerationAgent,
  runResumeAgent,
} from '../agent-runtime.mjs';

function normalizePath(value) {
  if (typeof value !== 'string' || value.startsWith('/') || value.includes('..')) throw new Error('unsafe path');
  return value.replaceAll('\\', '/');
}

test('remote providers fail clearly instead of silently falling back to local rules', () => {
  const previous = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    hermes: process.env.HERMES_API_KEY,
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HERMES_API_KEY;
  try {
    assert.throws(() => resolveAgentModel({ type: 'openai', apiKey: '' }), /API key 未配置/);
    assert.throws(() => resolveAgentModel({ type: 'anthropic', apiKey: '' }), /API key 未配置/);
    assert.throws(() => resolveAgentModel({ type: 'hermes', apiKey: '' }), /Hermes API key 未配置/);
  } finally {
    if (previous.openai) process.env.OPENAI_API_KEY = previous.openai;
    if (previous.anthropic) process.env.ANTHROPIC_API_KEY = previous.anthropic;
    if (previous.hermes) process.env.HERMES_API_KEY = previous.hermes;
  }
});

test('builds a multimodal user turn from a grounded PDF region', () => {
  const content = createVisualUserContent('Make this number 24.', {
    page: 2,
    label: 'highlighted region 3',
    selectedText: 'Used by 12 candidates',
    imageDataUrl: 'data:image/jpeg;base64,YQ==',
    mediaType: 'image/jpeg',
  });

  assert.equal(content.length, 2);
  assert.equal(content[0].type, 'text');
  assert.match(content[0].text, /page 2[\s\S]*Used by 12 candidates/);
  assert.deepEqual(content[1], {
    type: 'file',
    data: 'data:image/jpeg;base64,YQ==',
    mediaType: 'image/jpeg',
  });
});

test('passes PDF image content through the real tool-loop message conversion', async () => {
  let capturedPrompt;
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      capturedPrompt = options.prompt;
      return {
        content: [{ type: 'text', text: 'I found the rendered section.' }],
        finishReason: { unified: 'stop' }, usage, warnings: [],
      };
    },
  });

  await runResumeAgent({
    provider: { type: 'test' },
    modelOverride: model,
    message: 'Fix this region.',
    visualContext: {
      page: 1,
      label: 'highlighted region 1',
      selectedText: 'Experience',
      imageDataUrl: 'data:image/jpeg;base64,YQ==',
      mediaType: 'image/jpeg',
    },
    history: [], files: [{ path: 'resume.tex', source: 'Experience' }], entry: 'resume.tex',
    normalizePath, inspectResume: () => ({}), compileSnapshot: async () => ({ ok: true }),
  });

  assert.match(JSON.stringify(capturedPrompt), /"type":"file"[\s\S]*"mediaType":"image\/jpeg"[\s\S]*"data":"YQ=="/);
  assert.match(JSON.stringify(capturedPrompt), /Text extracted.*Experience/);
});

test('resume agent tools stage edits in memory and compile the staged snapshot', async () => {
  let compiledFiles;
  const runtime = createResumeAgentTools({
    files: [
      { path: 'resume.tex', source: '\\documentclass{article}\n\\begin{document}Old\\end{document}' },
      { path: 'sections/experience.tex', source: '\\section{Experience}' },
    ],
    entry: 'resume.tex',
    normalizePath,
    inspectResume: (source) => ({ characters: source.length }),
    compileSnapshot: async (files, entry) => {
      compiledFiles = { files, entry };
      return { ok: true, compiler: 'mock-tectonic', details: 'compiled' };
    },
  });

  const listed = await runtime.tools.list_project_files.execute({}, {});
  assert.equal(listed.entry, 'resume.tex');
  assert.equal(listed.files.length, 2);

  await runtime.tools.propose_file_edits.execute({
    edits: [{
      path: 'resume.tex',
      source: '\\documentclass{article}\n\\begin{document}Improved\\end{document}',
      summary: 'Tighten the document.',
    }],
  }, {});
  const result = await runtime.tools.compile_project.execute({}, {});

  assert.equal(result.ok, true);
  assert.equal(runtime.getLatestCompile(), result);
  assert.equal(compiledFiles.entry, 'resume.tex');
  assert.match(compiledFiles.files.find((file) => file.path === 'resume.tex').source, /Improved/);
  assert.equal(runtime.getProposals().length, 1);
});

test('resume agent tools allow safe new text files but reject unsafe and binary edits', async () => {
  const runtime = createResumeAgentTools({
    files: [{ path: 'resume.tex', source: 'safe' }],
    entry: 'resume.tex',
    normalizePath,
    inspectResume: () => ({}),
    compileSnapshot: async () => ({ ok: true }),
  });

  await runtime.tools.propose_file_edits.execute({ edits: [{ path: 'sections/new.tex', source: 'x', summary: 'new' }] }, {});
  assert.equal(runtime.getProposals()[0].path, 'sections/new.tex');
  assert.equal(runtime.getProposals()[0].operation, 'create');
  await assert.rejects(
    runtime.tools.propose_file_edits.execute({ edits: [{ path: '../resume.tex', source: 'x', summary: 'unsafe' }] }, {}),
    /unsafe path/,
  );
  await assert.rejects(
    runtime.tools.propose_file_edits.execute({ edits: [{ path: 'photo.png', source: 'x', summary: 'binary' }] }, {}),
    /不允许修改该文件类型/,
  );
});

test('generation-scoped tools can restrict edits to resume.tex', async () => {
  const runtime = createResumeAgentTools({
    files: [{ path: 'resume.tex', source: 'base' }, { path: 'source-data.json', source: '{}' }],
    entry: 'resume.tex',
    normalizePath,
    inspectResume: () => ({}),
    compileSnapshot: async () => ({ ok: true }),
    allowedEditPaths: ['resume.tex'],
  });
  await assert.rejects(
    runtime.tools.propose_file_edits.execute({ edits: [{ path: 'source-data.json', source: '{"changed":true}', summary: 'unsafe source rewrite' }] }, {}),
    /不允许修改该文件/,
  );
  await runtime.tools.propose_file_edits.execute({ edits: [{ path: 'resume.tex', source: 'generated', summary: 'safe generation edit' }] }, {});
  assert.equal(runtime.getProposals()[0].path, 'resume.tex');
});

test('resume agent can stage recoverable file deletions but cannot delete the active entry', async () => {
  let compiledFiles;
  const runtime = createResumeAgentTools({
    files: [
      { path: 'resume.tex', source: '\\input{sections/old}' },
      { path: 'sections/old.tex', source: 'obsolete' },
    ],
    entry: 'resume.tex',
    normalizePath,
    inspectResume: () => ({}),
    compileSnapshot: async (files) => {
      compiledFiles = files;
      return { ok: true };
    },
  });

  await runtime.tools.propose_file_edits.execute({
    edits: [{ operation: 'delete', path: 'sections/old.tex', summary: 'Remove obsolete section.' }],
  }, {});
  await runtime.tools.compile_project.execute({}, {});

  assert.equal(runtime.getProposals()[0].operation, 'delete');
  assert.equal(runtime.getProposals()[0].path, 'sections/old.tex');
  assert.equal(compiledFiles.some((file) => file.path === 'sections/old.tex'), false);
  await assert.rejects(
    runtime.tools.propose_file_edits.execute({
      edits: [{ operation: 'delete', path: 'resume.tex', summary: 'Remove main file.' }],
    }, {}),
    /不能删除当前 LaTeX 主文档/,
  );
});

test('tool-loop agent executes staged edit and compile steps before answering', async () => {
  let call = 0;
  let compiledSource = '';
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      call += 1;
      if (call === 1) return {
        content: [{
          type: 'tool-call',
          toolCallId: 'edit-1',
          toolName: 'propose_file_edits',
          input: JSON.stringify({ edits: [{ path: 'resume.tex', source: 'improved', summary: 'Focused wording' }] }),
        }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      if (call === 2) return {
        content: [{ type: 'tool-call', toolCallId: 'compile-1', toolName: 'compile_project', input: '{}' }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      return {
        content: [{ type: 'text', text: '修改已在临时副本中编译通过，请查看差异。' }],
        finishReason: { unified: 'stop' }, usage, warnings: [],
      };
    },
  });

  const result = await runResumeAgent({
    provider: { type: 'test' },
    modelOverride: model,
    message: '改进简历',
    history: [{ role: 'user', content: '先检查经历' }, { role: 'assistant', content: '好的' }],
    files: [{ path: 'resume.tex', source: 'original' }],
    entry: 'resume.tex',
    normalizePath,
    inspectResume: () => ({}),
    compileSnapshot: async (files) => {
      compiledSource = files[0].source;
      return { ok: true, compiler: 'mock', details: 'ok' };
    },
  });

  assert.equal(call, 3);
  assert.equal(compiledSource, 'improved');
  assert.equal(result.rawResult.edits[0].source, 'improved');
  assert.deepEqual(result.trace.map((item) => item.tool), ['propose_file_edits', 'compile_project']);
});

test('CV generation agent supports more than eight grounded steps and reports real progress', async () => {
  let call = 0;
  const capturedPrompts = [];
  let compiledSource = '';
  const progress = [];
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      call += 1;
      capturedPrompts.push(options.prompt);
      if (call <= 7) return {
        content: [{
          type: 'tool-call', toolCallId: `list-${call}`, toolName: 'list_project_files', input: '{}',
        }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      if (call === 8) return {
        content: [{
          type: 'tool-call', toolCallId: 'edit-generation', toolName: 'propose_file_edits',
          input: JSON.stringify({ edits: [{ operation: 'update', path: 'resume.tex', source: '\\documentclass{article}\\begin{document}Focused CV\\end{document}', summary: 'Tailor selected evidence.' }] }),
        }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      if (call === 9) return {
        content: [{ type: 'tool-call', toolCallId: 'compile-generation', toolName: 'compile_project', input: '{}' }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      if (call === 11) return {
        content: [{ type: 'tool-call', toolCallId: 'review-source', toolName: 'read_project_file', input: JSON.stringify({ path: 'source-data.json' }) }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      if (call === 12) return {
        content: [{ type: 'tool-call', toolCallId: 'review-layout', toolName: 'compile_project', input: '{}' }],
        finishReason: { unified: 'tool-calls' }, usage, warnings: [],
      };
      return {
        content: [{ type: 'text', text: '已完成紧贴职位的 CV。' }],
        finishReason: { unified: 'stop' }, usage, warnings: [],
      };
    },
  });

  const result = await runCvGenerationAgent({
    provider: { type: 'test' },
    modelOverride: model,
    fitLevel: 'strict',
    template: {
      id: 'sidebar', name: '侧栏肖像', layout: '双栏 · 个人侧栏', supportsPhoto: true,
      supportedSections: ['profile', 'experience', 'project', 'education', 'skill'],
    },
    files: [
      { path: 'resume.tex', source: '\\documentclass{article}\\begin{document}Base\\end{document}' },
      { path: 'source-data.json', source: JSON.stringify({ items: [{ title: 'Selected evidence' }], targetJobs: [{ title: 'Data role' }] }) },
    ],
    normalizePath,
    inspectResume: () => ({}),
    compileSnapshot: async (files) => {
      compiledSource = files.find((file) => file.path === 'resume.tex').source;
      return { ok: true, compiler: 'mock', layout: { pageCount: 1, pages: [{ verticalFillRatio: .82 }] } };
    },
    onProgress: (event) => progress.push(event),
  });

  assert.equal(RESUME_AGENT_MAX_STEPS, 12);
  assert.equal(CV_GENERATION_ROUNDS, 2);
  assert.equal(CV_GENERATION_MAX_STEPS, 20);
  assert.ok(CV_GENERATION_MAX_STEPS > 8);
  assert.equal(call, 13);
  const prompts = JSON.stringify(capturedPrompts);
  assert.match(prompts, /FIT LEVEL: strict — 紧贴职位/);
  assert.match(prompts, /TEMPLATE: sidebar · 侧栏肖像 · 双栏 · 个人侧栏/);
  assert.match(prompts, /binding layout and slot contract/);
  assert.match(prompts, /nearest semantically valid template slot/);
  assert.match(prompts, /omit it instead of inventing a section/);
  assert.match(prompts, /Never render a job description/);
  assert.match(prompts, /job description can guide emphasis[\s\S]*not evidence about the candidate/i);
  assert.match(prompts, /Autonomous round 2 of 2/);
  assert.match(prompts, /verticalFillRatio/);
  assert.equal(compiledSource, '\\documentclass{article}\\begin{document}Focused CV\\end{document}');
  assert.equal(result.rawResult.edits[0].path, 'resume.tex');
  assert.equal(result.rounds, 2);
  assert.equal(progress.at(-1).step, 13);
  assert.ok(progress.some((event) => event.tools.includes('autonomous_review')));
  assert.ok(progress.every((event) => event.maxSteps === CV_GENERATION_MAX_STEPS));
  assert.match(CV_FIT_POLICIES.none.instruction, /Ignore job descriptions entirely/);
});

test('Hermes uses its server-side agent directly with a bounded project snapshot', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'hermes-agent',
        output_text: JSON.stringify({ reply: '已检查。', edits: [{ path: 'resume.tex', source: 'better', summary: '更清楚' }] }),
      }),
    };
  };
  try {
    const result = await runResumeAgent({
      provider: { type: 'hermes', apiKey: 'local-secret', baseUrl: 'http://127.0.0.1:8642/v1' },
      message: '检查简历', history: [],
      files: [{ path: 'resume.tex', source: 'original' }], entry: 'resume.tex',
      normalizePath, inspectResume: () => ({}), compileSnapshot: async () => ({ ok: true }),
    });
    assert.equal(captured.url, 'http://127.0.0.1:8642/v1/responses');
    assert.match(captured.body.input, /PROJECT SNAPSHOT:[\s\S]*original/);
    assert.equal(result.rawResult.edits[0].source, 'better');
    assert.equal(result.trace[0].tool, 'hermes_server_agent');
  } finally {
    global.fetch = originalFetch;
  }
});
