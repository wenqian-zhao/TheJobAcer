const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bundles the offline Chinese font stack used by generated templates', () => {
  const manifestDirectory = path.join(__dirname, '..', 'vendor', 'tectonic', 'cache', 'manifests');
  const manifest = fs.readdirSync(manifestDirectory)
    .flatMap((name) => name.endsWith('.txt') ? [fs.readFileSync(path.join(manifestDirectory, name), 'utf8')] : [])
    .join('\n');
  ['xeCJK.sty', 'fontspec.sty', 'FandolSong-Regular.otf', 'FandolSong-Bold.otf']
    .forEach((asset) => assert.match(manifest, new RegExp(asset.replaceAll('.', '\\.'))));
});

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

test('keeps blank-line-separated local experiences and projects as individual structured records', async () => {
  const { localClassifyIntake } = await import('../intake-runtime.mjs');
  const segments = localClassifyIntake({
    text: `Jane Candidate
jane@example.com
Work Experience
Acme Engineer
Built platform

Beta Analyst
Improved reporting

Projects
Analytics Platform
Shipped analytics

Internal Portal
Launched portal`,
  });

  const experiences = segments.filter((segment) => segment.fields.personal.category === 'experience');
  const projects = segments.filter((segment) => segment.fields.personal.category === 'project');
  assert.deepEqual(experiences.map((segment) => segment.title), ['Acme Engineer', 'Beta Analyst']);
  assert.deepEqual(projects.map((segment) => segment.title), ['Analytics Platform', 'Internal Portal']);
  assert.ok(experiences.every((segment) => segment.fields.experiences.length === 1));
  assert.ok(projects.every((segment) => segment.fields.projects.length === 1));
});

test('splits a legacy whole-CV model response into reusable structured records', async () => {
  const { normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const segments = normalizeIntakeSegments({ segments: [{
    kind: 'cv', title: 'Jane CV', content: 'whole source', confidence: .9,
    fields: {
      profile: { name: 'Jane', summary: 'Data engineer' },
      experiences: [
        { role: 'Engineer', organization: 'Acme', bullets: ['Built a platform'] },
        { role: 'Analyst', organization: 'Beta', bullets: ['Improved reporting'] },
      ],
      projects: [
        { name: 'Analytics', bullets: ['Shipped it'] },
        { name: 'Customer Portal', role: 'Lead', bullets: ['Launched portal'] },
      ],
      education: [{ degree: 'BSc', institution: 'Example University', details: ['CS'] }],
      skills: [{ category: 'Data', items: ['SQL'] }],
      personal: { category: 'award', label: '荣誉和奖项', details: '一等奖' },
    },
  }] });

  assert.deepEqual(segments.map((segment) => segment.fields.personal.category),
    ['profile', 'experience', 'experience', 'project', 'project', 'education', 'skill', 'award']);
  assert.ok(segments.every((segment) => segment.kind === 'personal'));
  assert.deepEqual(segments.map((segment) => segment.title),
    ['个人信息', 'Engineer · Acme', 'Analyst · Beta', 'Analytics', 'Customer Portal · Lead', '教育经历', '专业技能', '荣誉和奖项']);
  assert.ok(segments.filter((segment) => segment.fields.personal.category === 'experience')
    .every((segment) => segment.fields.experiences.length === 1));
  assert.ok(segments.filter((segment) => segment.fields.personal.category === 'project')
    .every((segment) => segment.fields.projects.length === 1));
  assert.match(segments.find((segment) => segment.title === 'Engineer · Acme').content, /Built a platform/);
  assert.doesNotMatch(segments.find((segment) => segment.title === 'Engineer · Acme').content, /Improved reporting/);
});

test('keeps extended resume categories and orders common information first', async () => {
  const { normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const categories = ['talk', 'publication', 'social_practice', 'extracurricular', 'award', 'skill', 'education', 'project', 'experience', 'profile'];
  const segments = normalizeIntakeSegments({ segments: categories.map((category) => ({
    kind: 'personal', title: category, content: `${category} details`,
    fields: { personal: { category, label: category, details: `${category} details` } },
  })) });

  assert.deepEqual(segments.map((segment) => segment.fields.personal.category),
    ['profile', 'experience', 'project', 'education', 'skill', 'award', 'extracurricular', 'social_practice', 'talk', 'publication']);
});

test('normalizes legacy personal categories into the supported ten-category vocabulary', async () => {
  const { normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const legacyCategories = ['contact', 'summary', 'photo', 'other'];
  const segments = normalizeIntakeSegments({ segments: legacyCategories.map((category) => ({
    kind: 'personal',
    title: category,
    content: `${category} source fact`,
    fields: { personal: { category, details: `${category} source fact` } },
  })) });

  assert.equal(segments.length, legacyCategories.length);
  assert.ok(segments.every((segment) => segment.fields.personal.category === 'profile'));
});

test('keeps opaque pasted images reviewable in local intake mode', async () => {
  const { localClassifyIntake } = await import('../intake-runtime.mjs');
  const segments = localClassifyIntake({
    attachments: [{ name: 'recruiter-chat.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
  });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, 'personal');
  assert.deepEqual(segments[0].attachmentIndexes, [0]);
  assert.equal(segments[0].fields.personal.category, 'profile');
  assert.equal(segments[0].content, '');
  assert.equal(segments[0].extractionStatus, 'unreadable');
});

test('accepts only an explicitly marked supported image as a personal photo', async () => {
  const { hasMeaningfulExtractedContent, normalizeIntakeSegments } = await import('../intake-runtime.mjs');
  const source = { segments: [{
    kind: 'personal', title: '个人照片', content: '', attachmentIndexes: [0],
    fields: { profile: { isPhoto: true }, personal: { category: 'profile' } },
  }] };
  const portrait = normalizeIntakeSegments(source, '', [{ mimeType: 'image/png' }]);
  assert.equal(portrait[0].fields.profile.isPhoto, true);
  assert.deepEqual(portrait[0].photoAttachmentIndexes, [0]);
  assert.equal(portrait[0].extractionStatus, 'extracted');
  assert.equal(hasMeaningfulExtractedContent(portrait[0]), true);

  const document = normalizeIntakeSegments(source, '', [{ mimeType: 'application/pdf' }]);
  assert.deepEqual(document[0].photoAttachmentIndexes, []);
  assert.equal(document[0].extractionStatus, 'unreadable');
  assert.equal(hasMeaningfulExtractedContent(document[0]), false);
  const webp = normalizeIntakeSegments(source, '', [{ mimeType: 'image/webp' }]);
  assert.equal(webp[0].extractionStatus, 'unreadable');
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
  assert.match(prompt, /each individual job or internship as its own experience segment/);
  assert.match(prompt, /each individual project as its own project segment/);
  assert.match(prompt, /profile\|project\|experience\|award\|education\|skill\|extracurricular\|social_practice\|talk\|publication/);
  ['个人信息 = profile', '项目经历 = project', '工作经历 = experience', '荣誉和奖项 = award', '教育经历 = education',
    '专业技能 = skill', '课外活动 = extracurricular', '社会实践 = social_practice', '演讲和讲座 = talk', '论文发表 = publication']
    .forEach((mapping) => assert.match(prompt, new RegExp(mapping)));
  assert.doesNotMatch(prompt, /category":"[^"]*(?:contact|summary|photo|other)/);
  assert.match(prompt, /fields\.profile\.isPhoto/);
  assert.match(prompt, /Never mark screenshots, certificates, portfolio images, logos/);
  assert.match(prompt, /content must be only the user's source-grounded wording/);
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
  assert.match(files['resume.tex'], /\\cvsection\{项目经历\}/);
  assert.match(files['resume.tex'], /\\cvsection\{教育经历\}/);
  assert.match(files['resume.tex'], /\\cvsection\{专业技能\}/);
  assert.match(files['README.md'], /geekplux\/cv_resume/);
  assert.match(files['LICENSE.geekplux-cv.txt'], /MIT License/);
  assert.doesNotThrow(() => JSON.parse(files['source-data.json']));
});

test('applies multiple target jobs by fit level and fully excludes them at none', async () => {
  const { buildGeneratedCvFiles } = await import('../intake-runtime.mjs');
  const items = [{
    id: 'profile', kind: 'personal', title: 'Profile', content: 'General profile with SQL delivery.',
    fields: {
      profile: { name: 'Jane Candidate', headline: 'Platform Builder', summary: 'Builds reliable SQL systems.' },
      projects: [{ dates: '2025', name: 'Warehouse', role: 'Lead', bullets: ['Built SQL data models.'] }],
      personal: { category: 'profile' },
    },
  }];
  const jobItems = [{
    id: 'job-data', kind: 'job', title: 'Data Engineer',
    fields: { job: { title: 'Data Engineer', description: 'Own warehouse reliability.', keywords: ['SQL', 'Airflow'] } },
  }, {
    id: 'job-platform', kind: 'job', title: 'Platform Engineer',
    fields: { job: { title: 'Platform Engineer', description: 'Build developer platforms.', keywords: ['Reliability'] } },
  }];

  const strict = buildGeneratedCvFiles({ items, jobItems, fitLevel: 'strict' });
  const strictSource = JSON.parse(strict['source-data.json']);
  assert.match(strict['resume.tex'], /Data Engineer \/ Platform Engineer/);
  assert.deepEqual(strictSource.generation.targetJobIds, ['job-data', 'job-platform']);
  assert.equal(strictSource.targetJobs.length, 2);

  const none = buildGeneratedCvFiles({ items, jobItems, fitLevel: 'none' });
  const noneSource = JSON.parse(none['source-data.json']);
  assert.match(none['resume.tex'], /Platform Builder/);
  assert.doesNotMatch(none['resume.tex'], /Data Engineer|Platform Engineer|Own warehouse|Airflow/);
  assert.equal(noneSource.generation.fitLevel, 'none');
  assert.deepEqual(noneSource.generation.targetJobIds, []);
  assert.equal(noneSource.generation.templateId, 'classic');
  assert.deepEqual(noneSource.targetJobs, []);
});

test('renders four Chinese-ready template contracts with explicit photo behavior', async () => {
  const { buildGeneratedCvFiles, CV_TEMPLATE_REGISTRY } = await import('../intake-runtime.mjs');
  const items = [{
    id: 'profile', kind: 'personal', title: '个人信息', content: '',
    fields: {
      profile: { name: '赵小明', headline: '数据工程师', summary: '构建可靠的数据系统。', isPhoto: false },
      experiences: [{ dates: '2024—至今', role: '工程师', organization: '示例科技', location: '上海', bullets: ['提升系统稳定性。'] }],
      education: [{ dates: '2020—2024', degree: '计算机学士', institution: '示例大学', location: '北京', details: ['主修数据系统'] }],
      projects: [{ dates: '2024', name: '分析平台', role: '负责人', url: '', bullets: ['服务多个业务团队。'] }],
      skills: [{ category: '技术', items: ['SQL', 'Python'] }], personal: { category: 'profile' },
    },
  }, {
    id: 'photo', kind: 'personal', title: '个人照片', content: '',
    fields: { profile: { isPhoto: true }, personal: { category: 'profile' } },
  }, {
    id: 'campus', kind: 'personal', title: '校园活动', content: '组织校园技术分享。',
    fields: { personal: { category: 'extracurricular', details: '组织校园技术分享。' } },
  }];

  assert.deepEqual(CV_TEMPLATE_REGISTRY.map((template) => template.id), ['classic', 'awesome', 'sidebar', 'banking']);
  for (const template of CV_TEMPLATE_REGISTRY) {
    const files = buildGeneratedCvFiles({ items, templateId: template.id, photoPath: 'assets/profile.png' });
    const source = JSON.parse(files['source-data.json']);
    assert.match(files['resume.tex'], /赵小明/);
    assert.match(files['resume.tex'], /FandolSong-Regular/);
    assert.match(files['resume.tex'], /PingFang SC/);
    assert.equal(source.generation.templateId, template.id);
    assert.equal(source.template.id, template.id);
    assert.equal(source.template.supportsPhoto, template.supportsPhoto);
    assert.equal(source.generation.photo.available, true);
    assert.equal(source.generation.photo.rendered, template.supportsPhoto);
    assert.match(files['TEMPLATE-SOURCES.md'], new RegExp(template.sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    if (template.supportsPhoto) assert.match(files['resume.tex'], /includegraphics[\s\S]*assets\/profile\.png/);
    else assert.doesNotMatch(files['resume.tex'], /includegraphics/);
  }
  const bankingSource = JSON.parse(buildGeneratedCvFiles({ items, templateId: 'banking', photoPath: 'assets/profile.png' })['source-data.json']);
  assert.equal(bankingSource.template.itemPlacements.find((placement) => placement.itemId === 'campus').action, 'agent-nearest-or-omit');
});
