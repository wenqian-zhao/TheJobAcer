const test = require('node:test');
const assert = require('node:assert/strict');

test('decomposes a CV into personal-information categories beside job descriptions', async () => {
  const { localClassifyIntake } = await import('../intake-runtime.mjs');
  const segments = localClassifyIntake({
    text: `Jane Candidate\njane@example.com\nWork Experience\nBuilt a data platform.\nProjects\nCreated an analytics tool.\n\nJob Description\nResponsibilities: ship analytics products.\nRequirements: SQL and Python.`,
  });

  assert.deepEqual(segments.map((segment) => segment.kind), ['personal', 'personal', 'personal', 'job']);
  assert.deepEqual(segments.slice(0, 3).map((segment) => segment.fields.personal.category), ['profile', 'experience', 'project']);
  assert.equal(segments[0].fields.profile.email, 'jane@example.com');
  assert.match(segments[3].fields.job.description, /analytics products/);
  assert.ok(segments.every((segment) => segment.kind !== 'cv'));
});

test('splits a legacy whole-CV model response into reusable structured records', async () => {
  const { normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const segments = normalizeIntakeSegments({ segments: [{
    kind: 'cv', title: 'Jane CV', content: 'whole source', confidence: .9,
    fields: {
      profile: { name: 'Jane', summary: 'Data engineer' },
      experiences: [{ role: 'Engineer', organization: 'Acme', bullets: ['Built a platform'] }],
      projects: [{ name: 'Analytics', bullets: ['Shipped it'] }],
      education: [{ degree: 'BSc', institution: 'Example University', details: ['CS'] }],
      skills: [{ category: 'Data', items: ['SQL'] }],
      personal: { category: 'award', label: '荣誉和奖项', details: '一等奖' },
    },
  }] });

  assert.deepEqual(segments.map((segment) => segment.fields.personal.category),
    ['profile', 'experience', 'project', 'education', 'skill', 'award']);
  assert.ok(segments.every((segment) => segment.kind === 'personal'));
  assert.deepEqual(segments.map((segment) => segment.title),
    ['个人简介', '工作经历', '项目经历', '教育经历', '专业技能', '荣誉和奖项']);
});

test('keeps extended resume categories and orders common information first', async () => {
  const { normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const categories = ['talk', 'publication', 'social_practice', 'extracurricular', 'award', 'skill', 'education', 'project', 'experience', 'profile'];
  const segments = normalizeIntakeSegments({ segments: categories.map((category) => ({
    kind: 'personal', title: category, content: `${category} details`,
    fields: { personal: { category, label: category, details: `${category} details` } },
  })) });

  assert.deepEqual(segments.map((segment) => segment.fields.personal.category),
    ['profile', 'experience', 'project', 'education', 'skill', 'award', 'extracurricular', 'social_practice', 'publication', 'talk']);
});

test('keeps opaque pasted images reviewable in local intake mode', async () => {
  const { localClassifyIntake } = await import('../intake-runtime.mjs');
  const segments = localClassifyIntake({
    attachments: [{ name: 'recruiter-chat.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
  });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, 'personal');
  assert.deepEqual(segments[0].attachmentIndexes, [0]);
  assert.equal(segments[0].fields.personal.category, 'photo');
  assert.equal(segments[0].content, '');
  assert.equal(segments[0].extractionStatus, 'unreadable');
});

test('passes pasted screenshots through the visual model classifier', async () => {
  const { MockLanguageModelV4 } = await import('ai/test');
  const { runIntakeClassifier } = await import('../intake-runtime.mjs');
  let capturedPrompt;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      capturedPrompt = options.prompt;
      return {
        content: [{ type: 'text', text: JSON.stringify({
          segments: [{
            kind: 'job', title: 'Data Engineer', summary: 'Recruiter role brief', content: 'SQL role', confidence: 0.9,
            attachmentIndexes: [0], fields: { job: { title: 'Data Engineer', requirements: ['SQL'] } },
          }],
        }) }],
        finishReason: { unified: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
        warnings: [],
      };
    },
  });

  const result = await runIntakeClassifier({
    provider: { type: 'test' },
    modelOverride: model,
    text: 'Screenshot from recruiter',
    attachments: [{ name: 'chat.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==', text: '' }],
  });

  assert.equal(result.segments[0].kind, 'job');
  assert.deepEqual(result.segments[0].attachmentIndexes, [0]);
  assert.equal(result.segments[0].extractionStatus, 'extracted');
  assert.match(JSON.stringify(capturedPrompt), /"type":"file"[\s\S]*"mediaType":"image\/png"[\s\S]*"data":"YQ=="/);
});

test('passes rendered PDF pages to a visual model when local text extraction is empty', async () => {
  const { MockLanguageModelV4 } = await import('ai/test');
  const { runIntakeClassifier } = await import('../intake-runtime.mjs');
  let capturedPrompt;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      capturedPrompt = options.prompt;
      return {
        content: [{ type: 'text', text: JSON.stringify({
          segments: [{
            kind: 'cv', title: 'Scanned CV', summary: 'Visual extraction', content: 'Jane Candidate', confidence: 0.88,
            attachmentIndexes: [0], fields: { profile: { name: 'Jane Candidate' } },
          }],
        }) }],
        finishReason: { unified: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
        warnings: [],
      };
    },
  });

  const result = await runIntakeClassifier({
    provider: { type: 'test' },
    modelOverride: model,
    attachments: [{
      name: 'scanned-cv.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      text: '',
      previewImages: [
        { dataUrl: 'data:image/jpeg;base64,Yg==', mimeType: 'image/jpeg', page: 1 },
        { dataUrl: 'data:image/jpeg;base64,Yw==', mimeType: 'image/jpeg', page: 2 },
      ],
    }],
  });

  const prompt = JSON.stringify(capturedPrompt);
  assert.equal(result.segments[0].kind, 'personal');
  assert.equal(result.segments[0].fields.personal.category, 'profile');
  assert.equal(result.segments[0].extractionStatus, 'extracted');
  assert.match(prompt, /NEVER return a CV as one segment/);
  assert.match(prompt, /2 rendered page preview\(s\) follow/);
  assert.match(prompt, /Rendered page 1 for attachment 0/);
  assert.match(prompt, /"mediaType":"image\/jpeg"[\s\S]*"data":"Yg=="/);
  assert.match(prompt, /Rendered page 2 for attachment 0/);
  assert.match(prompt, /"mediaType":"image\/jpeg"[\s\S]*"data":"Yw=="/);
});

test('builds an attributed and escaped portable geekplux CV project', async () => {
  const { buildGeneratedCvFiles } = await import('../intake-runtime.mjs');
  const files = buildGeneratedCvFiles({
    items: [{
      id: 'personal-1',
      kind: 'personal',
      title: 'Profile',
      content: '',
      fields: {
        profile: { name: 'Jane & Zhao', headline: 'Data Engineer', email: 'jane@example.com', summary: 'Built safe systems.' },
        experiences: [{ dates: '2024', role: 'Engineer', organization: 'A&B', location: '', bullets: ['Improved throughput by 20%.'] }],
        education: [{ dates: '2020', degree: 'BSc', institution: 'Example University', location: '', details: ['Computer Science'] }],
        projects: [{ dates: '2023', name: 'Data Platform', role: 'Lead', url: 'https://example.com', bullets: ['Served 20 teams.'] }],
        skills: [{ category: 'Data', items: ['SQL', 'Python'] }], personal: { category: 'profile' },
      },
    }],
  });

  assert.match(files['resume.tex'], /Jane \\& Zhao/);
  assert.match(files['resume.tex'], /A\\&B/);
  assert.match(files['resume.tex'], /\\cvsection\{Projects\}/);
  assert.match(files['resume.tex'], /\\cvsection\{Education\}/);
  assert.match(files['resume.tex'], /\\cvsection\{Skills\}/);
  assert.match(files['README.md'], /geekplux\/cv_resume/);
  assert.match(files['LICENSE.geekplux-cv.txt'], /MIT License/);
  assert.doesNotThrow(() => JSON.parse(files['source-data.json']));
});
