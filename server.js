const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { structuredPatch, applyPatch } = require('diff');

const ROOT_DIR = process.env.CV_STUDIO_ROOT_DIR
  ? path.resolve(process.env.CV_STUDIO_ROOT_DIR)
  : __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const WORKSPACE_DIR = process.env.CV_STUDIO_WORKSPACE_DIR
  ? path.resolve(process.env.CV_STUDIO_WORKSPACE_DIR)
  : path.join(ROOT_DIR, 'workspace');
const PROJECT_STATE_FILE = path.join(WORKSPACE_DIR, '.cvstudio.json');
const INTAKE_BANK_DIR = path.join(WORKSPACE_DIR, '.cvstudio-bank');
const INTAKE_BANK_FILE = path.join(INTAKE_BANK_DIR, 'bank.json');
const INTAKE_ASSET_DIR = path.join(INTAKE_BANK_DIR, 'assets');
const SOURCE_FILE = path.join(WORKSPACE_DIR, 'resume.tex');
const PDF_FILE = path.join(WORKSPACE_DIR, 'resume.pdf');
const TECTONIC_ROOT = process.env.CV_STUDIO_TECTONIC_ROOT
  ? path.resolve(process.env.CV_STUDIO_TECTONIC_ROOT)
  : path.join(ROOT_DIR, 'vendor', 'tectonic');
const TECTONIC_CACHE_DIR = path.join(TECTONIC_ROOT, 'cache');
const PORT = Number(process.env.PORT) || 4173;
const ENTRY_FILE = 'resume.tex';
const IGNORED_PROJECT_EXTENSIONS = new Set(['.aux', '.fdb_latexmk', '.fls', '.log', '.out', '.pdf', '.synctex.gz']);
const IGNORED_PROJECT_DIRECTORIES = new Set(['.git', '.cvstudio-bank', 'node_modules', 'output', 'tmp']);
const EDITABLE_PROJECT_EXTENSIONS = new Set(['.tex', '.cls', '.sty', '.bib', '.txt', '.md', '.json', '.yaml', '.yml']);
const MAX_PROJECT_FILE_SIZE = 750_000;
const MAX_VISUAL_CONTEXT_BYTES = 2_500_000;
const MAX_INTAKE_ATTACHMENT_BYTES = 5_000_000;
const MAX_INTAKE_TOTAL_BYTES = 16_000_000;
const MAX_INTAKE_PREVIEW_BYTES = 2_500_000;
const MAX_INTAKE_PREVIEW_TOTAL_BYTES = 7_500_000;
const REMOTE_AGENT_TIMEOUT_MS = 300_000;
let activeProjectRoot = WORKSPACE_DIR;
let activeEntry = ENTRY_FILE;
let agentRuntimePromise;
let intakeRuntimePromise;

function loadAgentRuntime() {
  agentRuntimePromise ||= import('./agent-runtime.mjs');
  return agentRuntimePromise;
}

function loadIntakeRuntime() {
  intakeRuntimePromise ||= import('./intake-runtime.mjs');
  return intakeRuntimePromise;
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
};

async function commandExists(command) {
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command);
      return true;
    } catch {
      return false;
    }
  }
  const searchPaths = (process.env.PATH || '').split(path.delimiter);
  for (const directory of searchPaths) {
    try {
      await fs.access(path.join(directory, command));
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

async function findCompiler() {
  return findCompilerForEntry(activeEntry);
}

function compilerArgs(entry, kind, projectRoot = activeProjectRoot) {
  if (kind === 'tectonic-cached') return ['--only-cached', '--keep-logs', '--keep-intermediates', '--outdir', projectRoot, entry];
  if (kind === 'tectonic') return ['--keep-logs', '--keep-intermediates', '--outdir', projectRoot, entry];
  if (kind === 'latexmk') return ['-pdf', '-interaction=nonstopmode', '-halt-on-error', entry];
  return ['-interaction=nonstopmode', '-halt-on-error', entry];
}

async function findCompilerForEntry(entry = ENTRY_FILE, projectRoot = activeProjectRoot) {
  const bundledTectonic = path.join(TECTONIC_ROOT, `${process.platform}-${process.arch}`, 'tectonic');
  const systemTectonic = await commandExists('tectonic');
  if (systemTectonic && process.env.USE_BUNDLED_TECTONIC !== '1') {
    return {
      command: 'tectonic',
      args: compilerArgs(entry, 'tectonic-cached', projectRoot),
      env: { TECTONIC_CACHE_DIR },
      label: 'Tectonic · 本地缓存',
      cwd: projectRoot,
    };
  }
  if (await commandExists(bundledTectonic)) {
    return {
      command: bundledTectonic,
      args: compilerArgs(entry, 'tectonic-cached', projectRoot),
      env: { TECTONIC_CACHE_DIR },
      label: 'Tectonic · 项目内置',
      cwd: projectRoot,
    };
  }
  if (await commandExists('tectonic')) {
    return {
      command: 'tectonic',
      args: compilerArgs(entry, 'tectonic', projectRoot),
      label: 'Tectonic · 系统',
      cwd: projectRoot,
    };
  }
  if (await commandExists('latexmk')) {
    return { command: 'latexmk', args: compilerArgs(entry, 'latexmk', projectRoot), label: 'latexmk', cwd: projectRoot };
  }
  if (await commandExists('pdflatex')) {
    return { command: 'pdflatex', args: compilerArgs(entry, 'pdflatex', projectRoot), label: 'pdflatex', cwd: projectRoot };
  }
  return null;
}

function normalizeProjectPath(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('File path is required.');
  if (input.includes('\0')) throw new Error('Invalid project file path.');
  const normalized = path.posix.normalize(input.replaceAll('\\', '/'));
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.startsWith('/')) {
    throw new Error('Invalid project file path.');
  }
  return normalized;
}

function normalizeVisualContext(input) {
  if (!input || typeof input !== 'object') return null;
  const match = typeof input.imageDataUrl === 'string'
    ? input.imageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i)
    : null;
  if (!match) throw new Error('PDF visual context must be a PNG, JPEG, or WebP data URL.');
  const estimatedBytes = Math.floor(match[2].length * 3 / 4);
  if (estimatedBytes > MAX_VISUAL_CONTEXT_BYTES) throw new Error('PDF visual context is too large. Select a smaller region.');
  const page = Number(input.page);
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new Error('PDF visual context has an invalid page number.');
  const bounds = input.bounds && typeof input.bounds === 'object'
    ? Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Number(input.bounds[key])]))
    : null;
  if (!bounds || Object.values(bounds).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > 1.001 || bounds.y + bounds.height > 1.001) {
    throw new Error('PDF visual context has invalid bounds.');
  }
  return {
    page,
    bounds,
    label: typeof input.label === 'string' ? input.label.trim().slice(0, 120) : 'selected region',
    selectedText: typeof input.selectedText === 'string' ? input.selectedText.trim().slice(0, 5_000) : '',
    imageDataUrl: input.imageDataUrl,
    mediaType: match[1].toLowerCase(),
  };
}

function projectPath(input, root = activeProjectRoot) {
  const relativePath = normalizeProjectPath(input);
  const absolutePath = path.join(root, ...relativePath.split('/'));
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid project file path.');
  return { relativePath, absolutePath };
}

function isIgnoredProjectFile(relativePath) {
  return [...IGNORED_PROJECT_EXTENSIONS].some((extension) => relativePath.endsWith(extension));
}

function isEditableProjectFile(relativePath) {
  return EDITABLE_PROJECT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

async function walkProjectFiles(directory = activeProjectRoot, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_PROJECT_DIRECTORIES.has(entry.name)) files.push(...await walkProjectFiles(absolutePath, relativePath));
      continue;
    }
    if (!isIgnoredProjectFile(relativePath)) {
      const stats = await fs.stat(absolutePath);
      files.push({ path: relativePath, size: stats.size, editable: isEditableProjectFile(relativePath) && stats.size <= MAX_PROJECT_FILE_SIZE });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function readProjectFiles() {
  const files = await walkProjectFiles();
  return Promise.all(files.map(async (file) => ({
    ...file,
    source: file.editable ? await fs.readFile(projectPath(file.path).absolutePath, 'utf8') : null,
  })));
}

async function detectProjectEntry(files) {
  const texFiles = files.filter((file) => file.editable && file.path.toLowerCase().endsWith('.tex'));
  const candidates = [];
  for (const file of texFiles) {
    const source = file.source ?? await fs.readFile(projectPath(file.path).absolutePath, 'utf8');
    if (/\\documentclass(?:\[[^\]]*\])?\{/.test(source)) candidates.push(file.path);
  }
  return candidates.find((file) => file === 'resume.tex')
    || candidates.find((file) => path.posix.basename(file) === 'main.tex')
    || candidates[0]
    || texFiles[0]?.path
    || null;
}

async function projectState() {
  const files = await readProjectFiles();
  const detectedEntry = await detectProjectEntry(files);
  if (!files.some((file) => file.path === activeEntry) || !activeEntry.endsWith('.tex')) activeEntry = detectedEntry || ENTRY_FILE;
  const compiler = await findCompilerForEntry(activeEntry);
  return {
    root: activeProjectRoot,
    name: path.basename(activeProjectRoot),
    entry: activeEntry,
    entries: files.filter((file) => file.editable && file.path.endsWith('.tex') && /\\documentclass(?:\[[^\]]*\])?\{/.test(file.source || '')).map((file) => file.path),
    files,
    compilerAvailable: Boolean(compiler),
    compilerName: compiler?.label || null,
  };
}

async function setActiveProject(directory, preferredEntry) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Project folder path is required.');
  const resolved = path.resolve(directory.trim());
  if (resolved === path.parse(resolved).root) throw new Error('Choose a project folder, not the filesystem root.');
  const stats = await fs.stat(resolved);
  if (!stats.isDirectory()) throw new Error('The selected path is not a folder.');
  const previousRoot = activeProjectRoot;
  const previousEntry = activeEntry;
  activeProjectRoot = resolved;
  const files = await readProjectFiles();
  const detectedEntry = await detectProjectEntry(files);
  if (!detectedEntry) {
    activeProjectRoot = previousRoot;
    activeEntry = previousEntry;
    throw new Error('No LaTeX entry file was found in this folder.');
  }
  let normalizedPreferredEntry = null;
  try {
    normalizedPreferredEntry = typeof preferredEntry === 'string' ? normalizeProjectPath(preferredEntry) : null;
  } catch {
    // A stale or malformed library preference should not prevent opening the project.
  }
  const preferredFile = files.find((file) => file.path === normalizedPreferredEntry);
  activeEntry = preferredFile?.editable && preferredFile.path.endsWith('.tex')
    && /\\documentclass(?:\[[^\]]*\])?\{/.test(preferredFile.source || '')
    ? preferredFile.path
    : detectedEntry;
  await fs.writeFile(PROJECT_STATE_FILE, JSON.stringify({ root: activeProjectRoot, entry: activeEntry }, null, 2), 'utf8');
  return projectState();
}

async function duplicateActiveProject({ parentPath, name, files, entry }) {
  if (typeof parentPath !== 'string' || !parentPath.trim()) throw new Error('Choose a parent folder for the new CV.');
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName || projectName.length > 100 || projectName === '.' || projectName === '..'
    || projectName.startsWith('.') || /[\\/\0]/.test(projectName)) {
    throw new Error('CV name must be a normal folder name without slashes.');
  }
  const sourceRoot = activeProjectRoot;
  const sourceName = path.basename(sourceRoot);
  const parent = path.resolve(parentPath.trim());
  const parentStats = await fs.stat(parent);
  if (!parentStats.isDirectory()) throw new Error('The selected parent path is not a folder.');
  const [sourceRealRoot, parentRealRoot] = await Promise.all([fs.realpath(sourceRoot), fs.realpath(parent)]);
  if (parentRealRoot === path.parse(parentRealRoot).root) throw new Error('Choose a normal parent folder, not the filesystem root.');
  const targetRoot = path.join(parent, projectName);
  const targetRealRoot = path.join(parentRealRoot, projectName);
  if (targetRealRoot === sourceRealRoot || targetRealRoot.startsWith(`${sourceRealRoot}${path.sep}`)) {
    throw new Error('The new CV folder cannot be created inside the current CV project.');
  }
  try {
    await fs.access(targetRoot);
    throw new Error('A folder with this CV name already exists. Choose another name.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const tempRoot = path.join(parent, `.${projectName}.cvstudio-copy-${crypto.randomBytes(6).toString('hex')}`);
  const requestedEntry = normalizeProjectPath(typeof entry === 'string' ? entry : activeEntry);
  try {
    await fs.cp(sourceRoot, tempRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter(source) {
        if (source === sourceRoot) return true;
        const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
        const segments = relative.split('/');
        const namePart = path.basename(source);
        if (segments.some((segment) => segment === '.cvstudio-trash' || IGNORED_PROJECT_DIRECTORIES.has(segment))) return false;
        if (namePart === '.cvstudio.json' || isIgnoredProjectFile(relative)) return false;
        return true;
      },
    });
    for (const file of Array.isArray(files) ? files.slice(0, 100) : []) {
      if (!file || typeof file.path !== 'string' || typeof file.source !== 'string') continue;
      const target = projectPath(file.path, tempRoot);
      if (!isEditableProjectFile(target.relativePath)) throw new Error(`Unsupported project file: ${target.relativePath}`);
      if (Buffer.byteLength(file.source, 'utf8') > MAX_PROJECT_FILE_SIZE) throw new Error(`Project file is too large: ${target.relativePath}`);
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.writeFile(target.absolutePath, file.source, 'utf8');
    }
    await fs.access(projectPath(requestedEntry, tempRoot).absolutePath);
    await fs.rename(tempRoot, targetRoot);
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }

  await setActiveProject(targetRoot, requestedEntry);
  return { ...await projectState(), duplicatedFrom: sourceName };
}

async function loadActiveProject() {
  try {
    const saved = JSON.parse(await fs.readFile(PROJECT_STATE_FILE, 'utf8'));
    const stats = await fs.stat(saved.root);
    if (stats.isDirectory()) {
      activeProjectRoot = saved.root;
      activeEntry = typeof saved.entry === 'string' ? saved.entry : ENTRY_FILE;
    }
  } catch {
    activeProjectRoot = WORKSPACE_DIR;
    activeEntry = ENTRY_FILE;
  }
}

function pdfPathForEntry(entry = ENTRY_FILE) {
  const normalizedEntry = normalizeProjectPath(entry);
  const extension = path.posix.extname(normalizedEntry);
  return `${normalizedEntry.slice(0, normalizedEntry.length - extension.length)}.pdf`;
}

async function writeProjectFile(relativePath, source) {
  const target = projectPath(relativePath);
  if (typeof source !== 'string') throw new Error('Source must be a string.');
  if (Buffer.byteLength(source, 'utf8') > MAX_PROJECT_FILE_SIZE) throw new Error('Project file is too large.');
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await fs.writeFile(target.absolutePath, source, 'utf8');
  return target.relativePath;
}

function projectContext(files, entry = ENTRY_FILE) {
  const selected = files.find((file) => file.path === entry) || files[0];
  const snippets = files
    .filter((file) => /\.(tex|cls|sty|bib|txt|md)$/i.test(file.path))
    .map((file) => `--- ${file.path} ---\n${file.source.slice(0, 20_000)}`)
    .join('\n\n');
  return { selected, snippets: snippets.slice(0, 60_000) };
}

function runCompiler(compiler) {
  return new Promise((resolve) => {
    const child = spawn(compiler.command, compiler.args, {
      cwd: compiler.cwd || activeProjectRoot,
      env: { ...process.env, ...compiler.env, max_print_line: '1000' },
    });
    let output = '';

    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ ok: false, output: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });
}

async function compileProjectSnapshot(files, entry = activeEntry) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cvstudio-agent-'));
  try {
    await fs.cp(activeProjectRoot, tempRoot, {
      recursive: true,
      filter(source) {
        if (source === activeProjectRoot) return true;
        const name = path.basename(source);
        return !IGNORED_PROJECT_DIRECTORIES.has(name) && name !== '.git' && name !== '.cvstudio.json';
      },
    });
    for (const file of files) {
      if (!file || typeof file.path !== 'string' || typeof file.source !== 'string') continue;
      const target = projectPath(file.path, tempRoot);
      if (!isEditableProjectFile(target.relativePath)) throw new Error(`Unsupported project file: ${target.relativePath}`);
      if (Buffer.byteLength(file.source, 'utf8') > MAX_PROJECT_FILE_SIZE) throw new Error(`Project file is too large: ${target.relativePath}`);
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.writeFile(target.absolutePath, file.source, 'utf8');
    }
    const normalizedEntry = projectPath(entry, tempRoot).relativePath;
    const compiler = await findCompilerForEntry(normalizedEntry, tempRoot);
    if (!compiler) return { ok: false, error: '没有找到 LaTeX 编译器，修改尚未经过编译验证。' };
    const result = await runCompiler(compiler);
    return {
      ok: result.ok,
      compiler: compiler.label,
      details: usefulCompileOutput(result.output) || (result.ok ? '编译成功。' : '编译失败，但编译器没有返回详细信息。'),
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function usefulCompileOutput(output) {
  const lines = output.split('\n').map((line) => line.trimEnd());
  const errorIndex = lines.findIndex((line) => line.startsWith('!'));
  const selected = errorIndex >= 0
    ? lines.slice(errorIndex, errorIndex + 8)
    : lines.filter(Boolean).slice(-12);
  return selected.join('\n').slice(0, 4000);
}

function stripLatex(source) {
  return source
    .replace(/%.*$/gm, '')
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\s*(?:\{([^{}]*)\})?/g, '$1 ')
    .replace(/[{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inspectResume(source) {
  const plainText = stripLatex(source);
  const sections = {
    experience: /\\section\*?\{(?:experience|工作经历|经历|work history)/i.test(source),
    education: /\\section\*?\{(?:education|教育)/i.test(source),
    skills: /\\section\*?\{(?:skills|技能)/i.test(source),
  };
  const bulletLines = source.split('\n').filter((line) => /\\item\s+/.test(line));
  const quantifiedBullets = bulletLines.filter((line) => /\d+\s*\\?%|\$\s*[\d,.]+|\d+[+]?(?:\s|$)/.test(line));
  const strongVerb = /\\item\s+(?:built|led|designed|improved|reduced|increased|launched|created|owned|delivered|developed|implemented|建立|负责|提升|降低|设计|开发)/i.test(source);
  const contact = /(?:mailto:|@[a-z0-9.-]+\.[a-z]{2,}|\+?\d[\d ()-]{7,})/i.test(source);
  const checks = [
    { id: 'contact', label: '联系方式完整', pass: contact, detail: contact ? '检测到邮箱或电话。' : '建议加入邮箱和电话，方便招聘方联系。' },
    { id: 'sections', label: '核心板块齐全', pass: sections.experience && sections.education && sections.skills, detail: sections.experience && sections.education && sections.skills ? '经历、教育、技能均已找到。' : '建议至少保留经历、教育、技能三个板块。' },
    { id: 'impact', label: '经历包含量化结果', pass: quantifiedBullets.length > 0, detail: quantifiedBullets.length > 0 ? `${quantifiedBullets.length} 条经历 bullet 含数字或指标。` : '把“负责了什么”改成“做了什么，带来什么结果”。' },
    { id: 'verbs', label: '使用行动动词', pass: strongVerb, detail: strongVerb ? '检测到较明确的行动动词。' : '用 Built、Led、Improved 等动词开头，减少职责描述。' },
  ];
  const passed = checks.filter((check) => check.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const suggestions = [];
  if (!contact) suggestions.push({ severity: 'high', title: '补齐联系方式', body: '在姓名附近加入可点击邮箱、电话和所在城市。' });
  if (!sections.experience) suggestions.push({ severity: 'high', title: '补充经历板块', body: '把最相关的项目、实习或工作经历放在简历上半部分。' });
  if (!quantifiedBullets.length) suggestions.push({ severity: 'high', title: '加入可验证结果', body: '每条经历尽量包含规模、速度、成本、转化率或用户数等指标。' });
  if (plainText.length > 2600) suggestions.push({ severity: 'medium', title: '控制篇幅', body: '当前文本偏长，优先删掉重复职责和弱相关经历，让重点更容易被扫描。' });
  if (!suggestions.length) suggestions.push({ severity: 'low', title: '保持结构，继续打磨', body: '基础结构已经不错，可以针对目标岗位逐条改写 bullet。' });
  return {
    score,
    summary: score >= 80 ? '基础完成度不错，适合开始做岗位定制。' : score >= 55 ? '基础结构可用，建议先处理高优先级缺口。' : '先补齐结构和结果表达，再进行岗位定制。',
    metrics: { characters: plainText.length, bullets: bulletLines.length, quantified: quantifiedBullets.length },
    checks,
    suggestions,
    analyzedAt: new Date().toISOString(),
  };
}

const INTERVIEW_RUBRIC = {
  behavioral: {
    label: '行为面试',
    questions: [
      '请介绍一个你推动完成、但一开始并不顺利的项目。',
      '讲一次你和同事或合作方意见不一致的经历。',
      '你最近一次收到的有价值的负面反馈是什么？',
    ],
  },
  technical: {
    label: '技术面试',
    questions: [
      '请讲一个你做过的技术决策，并说明你如何权衡取舍。',
      '线上服务出现明显延迟时，你会如何定位和处理？',
      '如何设计一个可观测、可逐步扩展的 API？',
    ],
  },
  product: {
    label: '产品面试',
    questions: [
      '请介绍一个你认为值得改进的产品体验，并说明优先级。',
      '当用户反馈和业务指标冲突时，你会如何决策？',
      '如何验证一个新功能是否真的解决了用户问题？',
    ],
  },
};

function evaluateInterview(question, answer, role = 'behavioral') {
  const text = answer.trim();
  const latinWords = text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g)?.length || 0;
  const cjkCharacters = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const words = latinWords + Math.ceil(cjkCharacters / 1.5);
  const signals = {
    context: /(背景|当时|情况|因为|when|situation|context)/i.test(text),
    action: /(我负责|我做|我决定|我推动|我设计|我实现|我协调|我分析|i |my |led|built|designed|decided|implemented)/i.test(text),
    result: /(结果|最终|因此|提升|降低|增长|影响|result|impact|improved|reduced|increased|%)/i.test(text),
    reflection: /(学到|反思|下次|如果重来|learned|reflect|next time)/i.test(text),
  };
  const signalCount = Object.values(signals).filter(Boolean).length;
  let score = Math.min(100, 28 + signalCount * 16 + (words >= 45 ? 8 : 0) + (words >= 90 ? 8 : 0));
  if (words < 25) score = Math.min(score, 42);
  const feedback = [];
  if (words < 25) feedback.push('回答有些短，补充背景、你的具体动作和结果。');
  if (!signals.context) feedback.push('先交代场景或问题，让面试官知道事情为什么重要。');
  if (!signals.action) feedback.push('增加“我做了什么”，避免只描述团队或最终结果。');
  if (!signals.result) feedback.push('尽量用结果收尾，最好有数字、时间或可观察影响。');
  if (!signals.reflection && role === 'behavioral') feedback.push('最后补一句复盘或下次会怎么做，答案会更完整。');
  if (!feedback.length) feedback.push('结构完整，继续压缩铺垫，把最有说服力的细节留给追问。');
  return {
    score,
    signals,
    feedback,
    nextPrompt: score < 60 ? '追问：你在这个过程中亲自做的最关键一步是什么？' : '追问：如果再做一次，你会改变什么？',
    wordCount: words,
    rubric: INTERVIEW_RUBRIC[role]?.label || INTERVIEW_RUBRIC.behavioral.label,
    evaluatedAt: new Date().toISOString(),
    question,
  };
}

function hashSource(source) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

function normalizeAgentResult(rawResult, files, mode, model, entry = ENTRY_FILE) {
  const result = rawResult && typeof rawResult === 'object' ? rawResult : {};
  const sourceByPath = new Map(files.map((file) => [file.path, file.source]));
  const edits = [];
  for (const edit of Array.isArray(result.edits) ? result.edits.slice(0, 20) : []) {
    if (!edit || typeof edit.path !== 'string') continue;
    let normalizedPath;
    try { normalizedPath = normalizeProjectPath(edit.path); } catch { continue; }
    if (!isEditableProjectFile(normalizedPath)) continue;
    const baseExists = sourceByPath.has(normalizedPath);
    const operation = ['create', 'update', 'delete'].includes(edit.operation)
      ? edit.operation
      : typeof edit.source === 'string' ? (baseExists ? 'update' : 'create') : null;
    if (!operation || (operation === 'create' && baseExists) || (operation !== 'create' && !baseExists)) continue;
    if (operation === 'delete' && normalizedPath === entry) continue;
    if (operation !== 'delete' && typeof edit.source !== 'string') continue;
    if (operation !== 'delete' && Buffer.byteLength(edit.source, 'utf8') > MAX_PROJECT_FILE_SIZE) continue;
    const oldSource = sourceByPath.get(normalizedPath) || '';
    const nextSource = operation === 'delete' ? '' : edit.source;
    if (operation === 'update' && oldSource === nextSource) continue;
    const patch = structuredPatch(normalizedPath, normalizedPath, oldSource, nextSource, '', '', { context: 3 });
    edits.push({
      operation,
      path: normalizedPath,
      source: operation === 'delete' ? null : nextSource,
      baseSource: oldSource,
      baseExists,
      summary: typeof edit.summary === 'string' ? edit.summary : `Agent proposed a file ${operation}.`,
      baseHash: hashSource(oldSource),
      patch,
    });
  }
  return {
    response: typeof result.reply === 'string' ? result.reply : 'Agent returned no explanation.',
    mode,
    model: model || null,
    edits,
  };
}

function localResumeAgent(message, files, entry) {
  const context = projectContext(files, entry);
  const source = context.selected?.source || '';
  const analysis = inspectResume(source);
  const fileNames = files.map((file) => file.path);
  const lowerMessage = message.toLowerCase();
  let response;

  if (/结构|分析|检查|review|audit/.test(lowerMessage)) {
    const priorities = analysis.suggestions.slice(0, 3).map((item, index) => `${index + 1}. ${item.title}：${item.body}`).join('\n');
    response = `我检查了 ${context.selected?.path || entry}。当前本地评分是 ${analysis.score}/100。\n\n${priorities}`;
  } else if (/文件|拆分|multiple|split|structure/.test(lowerMessage)) {
    response = `当前项目有 ${files.length} 个可编辑文件：${fileNames.join('、')}。\n\n可以把经历拆到 sections/experience.tex，把公共命令放到 resume.sty，再从 ${entry} 用 \\input{} 引用。`;
  } else if (/量化|数字|metric|impact/.test(lowerMessage)) {
    response = analysis.metrics.quantified
      ? `我找到了 ${analysis.metrics.quantified} 条包含数字或指标的 bullet。下一步可以检查这些数字是否明确说明了规模、速度、成本或业务影响。`
      : '当前没有检测到量化结果。请选择一条经历，补充真实的规模、时间、效率、收入或用户影响；我不会替你编造数字。';
  } else {
    response = `我已经读到 ${files.length} 个项目文件，入口是 ${entry}。目前运行在本地模式，不会调用外部模型。\n\n你可以让我“检查简历结构”“建议如何拆分多文件”或“找出缺少量化结果的经历”。配置 OpenAI / Anthropic 后，我可以做更细的逐段改写建议。`;
  }

  return { response, mode: 'local', model: null, edits: [] };
}

function emptyIntakeBank() {
  return { version: 2, submissions: [], items: [], assets: [] };
}

async function readIntakeBank() {
  try {
    const stored = JSON.parse(await fs.readFile(INTAKE_BANK_FILE, 'utf8'));
    return {
      version: 2,
      submissions: Array.isArray(stored.submissions) ? stored.submissions.slice(-250) : [],
      items: Array.isArray(stored.items) ? stored.items.slice(-1_000) : [],
      assets: Array.isArray(stored.assets) ? stored.assets.slice(-1_000) : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return emptyIntakeBank();
    throw error;
  }
}

async function writeIntakeBank(bank) {
  await fs.mkdir(INTAKE_BANK_DIR, { recursive: true });
  const temporaryFile = `${INTAKE_BANK_FILE}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, INTAKE_BANK_FILE);
}

function publicIntakeBank(bank) {
  const assets = new Map(bank.assets.map((asset) => [asset.id, {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    url: `/api/intake/assets/${encodeURIComponent(asset.id)}`,
  }]));
  const items = [...bank.items].reverse().map((item) => ({
    ...item,
    kind: item.kind === 'job' ? 'job' : 'personal',
    status: item.status === 'archived' ? 'archived' : 'active',
    recordedAt: item.recordedAt || item.createdAt || item.updatedAt || null,
    assets: (item.assetIds || []).flatMap((id) => assets.has(id) ? [assets.get(id)] : []),
  }));
  return {
    version: 2,
    items,
    counts: {
      job: items.filter((item) => item.kind === 'job').length,
      personal: items.filter((item) => item.kind === 'personal').length,
    },
  };
}

function normalizeIntakeAttachment(attachment, index, includeData = true) {
  if (!attachment || typeof attachment !== 'object') throw new Error(`Invalid intake attachment ${index + 1}.`);
  const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl : '';
  const match = dataUrl.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error(`Attachment ${index + 1} must contain a valid base64 data URL.`);
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_INTAKE_ATTACHMENT_BYTES) {
    throw new Error(`Attachment ${index + 1} must be smaller than 5 MB.`);
  }
  const rawName = typeof attachment.name === 'string' ? path.basename(attachment.name.trim()) : '';
  const name = rawName && rawName.length <= 180 ? rawName : `pasted-${index + 1}`;
  const previewImages = includeData ? (Array.isArray(attachment.previewImages) ? attachment.previewImages : []).slice(0, 3).map((preview, previewIndex) => {
    const previewUrl = typeof preview?.dataUrl === 'string' ? preview.dataUrl : '';
    const previewMatch = previewUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
    if (!previewMatch) throw new Error(`Attachment ${index + 1} preview ${previewIndex + 1} is not a supported image.`);
    const previewSize = Buffer.from(previewMatch[2], 'base64').length;
    if (!previewSize || previewSize > MAX_INTAKE_PREVIEW_BYTES) throw new Error(`Attachment ${index + 1} preview ${previewIndex + 1} is too large.`);
    return { dataUrl: previewUrl, mimeType: previewMatch[1].toLowerCase(), size: previewSize };
  }) : [];
  return {
    name,
    mimeType: match[1].toLowerCase(),
    size: bytes.length,
    text: typeof attachment.text === 'string' ? attachment.text.slice(0, 40_000) : '',
    ...(includeData ? { dataUrl, bytes, previewImages } : {}),
  };
}

function normalizeIntakeAttachments(value, includeData = true) {
  const attachments = (Array.isArray(value) ? value : []).slice(0, 20)
    .map((attachment, index) => normalizeIntakeAttachment(attachment, index, includeData));
  if (attachments.reduce((total, attachment) => total + attachment.size, 0) > MAX_INTAKE_TOTAL_BYTES) {
    throw new Error('Pasted attachments must be smaller than 16 MB in total.');
  }
  if (attachments.reduce((total, attachment) => total + (attachment.previewImages || []).reduce((sum, preview) => sum + preview.size, 0), 0) > MAX_INTAKE_PREVIEW_TOTAL_BYTES) {
    throw new Error('Rendered PDF previews are too large. Select fewer or smaller files.');
  }
  return attachments;
}

function assetExtension(attachment) {
  const existing = path.extname(attachment.name).toLowerCase().replace(/[^.a-z0-9]/g, '');
  if (existing && existing.length <= 12) return existing;
  return ({
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'application/pdf': '.pdf', 'text/plain': '.txt', 'text/markdown': '.md',
  })[attachment.mimeType] || '.bin';
}

async function commitIntakeSubmission(body) {
  const rawText = typeof body.text === 'string' ? body.text.trim().slice(0, 120_000) : '';
  const rawHtml = typeof body.html === 'string' ? body.html.trim().slice(0, 180_000) : '';
  const attachments = normalizeIntakeAttachments(body.attachments, true);
  const { hasMeaningfulExtractedContent, normalizeIntakeSegments } = await loadIntakeRuntime();
  const segments = normalizeIntakeSegments(body.segments, rawText, attachments.length);
  if (!segments.length) throw new Error('At least one reviewed intake segment is required.');
  const unreadable = segments.filter((segment) => !hasMeaningfulExtractedContent(segment));
  if (unreadable.length) throw new Error(`有 ${unreadable.length} 条材料还没有提取出可入库内容。请使用视觉模型、补充文字或移除这些条目。`);
  if (!rawText && !rawHtml && !attachments.length) throw new Error('Paste text, images, or files before saving.');

  await fs.mkdir(INTAKE_ASSET_DIR, { recursive: true });
  const now = new Date().toISOString();
  const submissionId = `submission-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const assetRecords = [];
  for (const [index, attachment] of attachments.entries()) {
    const id = `asset-${Date.now()}-${index}-${crypto.randomBytes(5).toString('hex')}`;
    const fileName = `${id}${assetExtension(attachment)}`;
    await fs.writeFile(path.join(INTAKE_ASSET_DIR, fileName), attachment.bytes);
    assetRecords.push({
      id,
      submissionId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      fileName,
      extractedText: attachment.text,
      createdAt: now,
    });
  }
  const allAssetIds = assetRecords.map((asset) => asset.id);
  const itemRecords = segments.map((segment) => ({
    id: `material-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`,
    submissionId,
    kind: segment.kind,
    title: segment.title,
    summary: segment.summary,
    content: segment.content,
    confidence: segment.confidence,
    extractionStatus: 'extracted',
    status: 'active',
    fields: segment.fields,
    assetIds: segment.attachmentIndexes.length
      ? segment.attachmentIndexes.flatMap((index) => assetRecords[index]?.id ? [assetRecords[index].id] : [])
      : segments.length === 1 ? allAssetIds : [],
    createdAt: now,
    recordedAt: now,
    updatedAt: now,
  }));
  const bank = await readIntakeBank();
  bank.submissions.push({ id: submissionId, rawText, rawHtml, assetIds: allAssetIds, createdAt: now });
  bank.assets.push(...assetRecords);
  bank.items.push(...itemRecords);
  await writeIntakeBank(bank);
  return { saved: itemRecords, bank: publicIntakeBank(bank) };
}

async function deleteIntakeItem(itemId) {
  const bank = await readIntakeBank();
  const index = bank.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error('Bank item was not found.');
  const [removed] = bank.items.splice(index, 1);
  await writeIntakeBank(bank);
  return { removed: removed.id, bank: publicIntakeBank(bank) };
}

async function generateCvFromBank({ parentPath, name, itemIds, jobId }) {
  if (typeof parentPath !== 'string' || !parentPath.trim()) throw new Error('Choose a parent folder for the generated CV.');
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName || projectName.length > 100 || projectName === '.' || projectName === '..'
    || projectName.startsWith('.') || /[\\/\0]/.test(projectName)) {
    throw new Error('CV name must be a normal folder name without slashes.');
  }
  const parent = path.resolve(parentPath.trim());
  const parentStats = await fs.stat(parent);
  if (!parentStats.isDirectory()) throw new Error('The selected parent path is not a folder.');
  const parentRealRoot = await fs.realpath(parent);
  if (parentRealRoot === path.parse(parentRealRoot).root) throw new Error('Choose a normal parent folder, not the filesystem root.');
  const targetRoot = path.join(parent, projectName);
  try {
    await fs.access(targetRoot);
    throw new Error('A folder with this CV name already exists. Choose another name.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const bank = await readIntakeBank();
  const requestedIds = new Set(Array.isArray(itemIds) ? itemIds.filter((id) => typeof id === 'string') : []);
  const selected = bank.items.filter((item) => ['cv', 'personal'].includes(item.kind)
    && (!requestedIds.size || requestedIds.has(item.id)))
    .map((item) => ({ ...item, kind: 'personal' }));
  if (!selected.length) throw new Error('Add at least one personal information item to the information bank first.');
  const targetJob = typeof jobId === 'string' ? bank.items.find((item) => item.id === jobId && item.kind === 'job') || null : null;
  const assets = new Map(bank.assets.map((asset) => [asset.id, asset]));
  const isRenderablePhoto = (asset) => /^(?:image\/(?:png|jpeg|webp))$/.test(asset?.mimeType || '');
  const photoAsset = selected.flatMap((item) => item.fields?.personal?.category === 'photo' ? item.assetIds || [] : [])
    .map((id) => assets.get(id)).find(isRenderablePhoto)
    || selected.flatMap((item) => item.assetIds || []).map((id) => assets.get(id)).find(isRenderablePhoto);
  const photoPath = photoAsset ? `assets/profile${assetExtension(photoAsset)}` : '';
  const { buildGeneratedCvFiles } = await loadIntakeRuntime();
  const generatedFiles = buildGeneratedCvFiles({ items: selected, jobItem: targetJob, photoPath });
  const tempRoot = path.join(parent, `.${projectName}.cvstudio-generate-${crypto.randomBytes(6).toString('hex')}`);
  try {
    await fs.mkdir(tempRoot, { recursive: false });
    for (const [filePath, source] of Object.entries(generatedFiles)) {
      const target = projectPath(filePath, tempRoot);
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.writeFile(target.absolutePath, source, 'utf8');
    }
    if (photoAsset) {
      const photoTarget = projectPath(photoPath, tempRoot);
      await fs.mkdir(path.dirname(photoTarget.absolutePath), { recursive: true });
      await fs.copyFile(path.join(INTAKE_ASSET_DIR, photoAsset.fileName), photoTarget.absolutePath);
    }
    await fs.rename(tempRoot, targetRoot);
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
  const state = await setActiveProject(targetRoot, 'resume.tex');
  return {
    ...state,
    generatedFrom: selected.map((item) => item.id),
    targetJob: targetJob?.id || null,
    template: { name: 'geekplux/cv_resume · CV Studio portable edition', license: 'MIT' },
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function formatAgentProviderError(error, providerType = 'provider') {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || 'Unknown provider error.');
  if (status === 401 || /unauthorized|invalid api key|authentication/i.test(message)) {
    return `${providerType} 身份验证失败（401）。请检查 API key 和 Base URL。`;
  }
  if (status === 403 || /forbidden|permission denied/i.test(message)) {
    return `${providerType} 拒绝了请求（403）。请检查 API key 权限、模型访问权限和 Base URL。`;
  }
  if (status === 404 || /model.*not found|not_found_error/i.test(message)) {
    return `${providerType} 找不到所选模型。请检查 Model 名称或恢复默认值。`;
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) {
    return `${providerType} 当前限流（429）。请稍后重试或检查账户额度。`;
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return `${providerType} 请求超过 300 秒，已安全停止。你可以缩小任务后重试。`;
  }
  return message;
}

async function readJson(request, maxCharacters = 5_000_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxCharacters) throw new Error('Document is too large.');
  }
  return JSON.parse(body || '{}');
}

async function serveFile(response, filePath, contentType) {
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/api/project') {
    sendJson(response, 200, await projectState());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/agent/status') {
    sendJson(response, 200, {
      environmentKeys: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        hermes: Boolean(process.env.HERMES_API_KEY),
      },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/intake/bank') {
    sendJson(response, 200, publicIntakeBank(await readIntakeBank()));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/intake/assets/')) {
    try {
      const assetId = decodeURIComponent(url.pathname.slice('/api/intake/assets/'.length));
      const bank = await readIntakeBank();
      const asset = bank.assets.find((item) => item.id === assetId);
      if (!asset || path.basename(asset.fileName) !== asset.fileName) throw new Error('Bank asset was not found.');
      const inlineType = /^(?:image\/(?:png|jpeg|webp|gif)|application\/pdf)$/.test(asset.mimeType)
        ? asset.mimeType
        : 'application/octet-stream';
      await serveFile(response, path.join(INTAKE_ASSET_DIR, asset.fileName), inlineType);
    } catch (error) {
      sendJson(response, 404, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/intake/classify') {
    const body = await readJson(request, 38_000_000);
    try {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 120_000) : '';
      const attachments = normalizeIntakeAttachments(body.attachments, true).map(({ name, mimeType, text: extractedText, dataUrl, previewImages }) => ({
        name, mimeType, text: extractedText, dataUrl, previewImages,
      }));
      if (!text && !attachments.length) throw new Error('Paste text, images, or files before organizing.');
      const provider = body.provider && typeof body.provider === 'object' ? body.provider : { type: 'local' };
      if (provider.type && !['local', 'openai', 'anthropic', 'hermes'].includes(provider.type)) throw new Error('Unsupported intake provider.');
      const { runIntakeClassifier } = await loadIntakeRuntime();
      const result = await runIntakeClassifier({
        provider,
        text,
        attachments,
        abortSignal: AbortSignal.timeout(REMOTE_AGENT_TIMEOUT_MS),
      });
      sendJson(response, 200, result);
    } catch (error) {
      const providerType = body.provider?.type || 'provider';
      const message = formatAgentProviderError(error, providerType);
      const configurationError = /API key|Base URL|gateway|配置|401|403|找不到所选模型/.test(message);
      sendJson(response, configurationError ? 400 : 422, { error: message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/intake/commit') {
    const body = await readJson(request, 24_000_000);
    try {
      sendJson(response, 201, await commitIntakeSubmission(body));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/intake/items/')) {
    try {
      const itemId = decodeURIComponent(url.pathname.slice('/api/intake/items/'.length));
      sendJson(response, 200, await deleteIntakeItem(itemId));
    } catch (error) {
      sendJson(response, 404, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/intake/generate') {
    const body = await readJson(request);
    try {
      sendJson(response, 201, await generateCvFromBank(body));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/project/open') {
    const body = await readJson(request);
    try {
      sendJson(response, 200, await setActiveProject(body.path, body.entry));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/project/duplicate') {
    const body = await readJson(request);
    try {
      sendJson(response, 201, await duplicateActiveProject(body));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/project/entry') {
    const body = await readJson(request);
    try {
      const entry = projectPath(body.entry).relativePath;
      if (!entry.endsWith('.tex')) throw new Error('The main document must be a .tex file.');
      await fs.access(projectPath(entry).absolutePath);
      activeEntry = entry;
      await fs.writeFile(PROJECT_STATE_FILE, JSON.stringify({ root: activeProjectRoot, entry: activeEntry }, null, 2), 'utf8');
      sendJson(response, 200, { ok: true, entry });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/file') {
    const body = await readJson(request);
    try {
      const savedPath = await writeProjectFile(body.path, body.source);
      sendJson(response, 200, { ok: true, path: savedPath });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/files') {
    const body = await readJson(request);
    try {
      const target = projectPath(body.path);
      try {
        await fs.access(target.absolutePath);
        sendJson(response, 409, { error: 'A file with that name already exists.' });
        return;
      } catch {
        // The path is available.
      }
      const savedPath = await writeProjectFile(target.relativePath, typeof body.source === 'string' ? body.source : '');
      sendJson(response, 201, { ok: true, path: savedPath });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/document') {
    const [source, compiler] = await Promise.all([
      fs.readFile(projectPath(activeEntry).absolutePath, 'utf8'),
      findCompiler(),
    ]);
    sendJson(response, 200, {
      source,
      compilerAvailable: Boolean(compiler),
      compilerName: compiler?.label || null,
    });
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/document') {
    const body = await readJson(request);
    if (typeof body.source !== 'string') {
      sendJson(response, 400, { error: 'Source must be a string.' });
      return;
    }
    await fs.writeFile(projectPath(activeEntry).absolutePath, body.source, 'utf8');
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/compile') {
    const body = await readJson(request);
    const entry = typeof body.entry === 'string' ? body.entry : activeEntry;
    try {
      if (Array.isArray(body.files)) {
        for (const file of body.files) await writeProjectFile(file.path, file.source);
      } else if (typeof body.source === 'string') {
        await writeProjectFile(activeEntry, body.source);
      } else {
        throw new Error('Project files are required.');
      }
      projectPath(entry);
      activeEntry = entry;
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    const compiler = await findCompilerForEntry(entry);
    if (!compiler) {
      sendJson(response, 503, {
        error: 'No LaTeX compiler found. Install MacTeX, then restart the editor.',
      });
      return;
    }

    const result = await runCompiler(compiler);
    if (!result.ok) {
      sendJson(response, 422, {
        error: 'LaTeX compilation failed.',
        details: usefulCompileOutput(result.output),
      });
      return;
    }

    sendJson(response, 200, { ok: true, compiler: compiler.label, pdfPath: pdfPathForEntry(entry) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/agent') {
    const body = await readJson(request);
    if (typeof body.message !== 'string' || !body.message.trim() || !Array.isArray(body.files)) {
      sendJson(response, 400, { error: 'Message and project files are required.' });
      return;
    }
    let files;
    let entry;
    try {
      files = body.files
        .filter((file) => file && typeof file.path === 'string' && typeof file.source === 'string')
        .slice(0, 100)
        .map((file) => ({ path: normalizeProjectPath(file.path), source: file.source }));
      entry = normalizeProjectPath(typeof body.entry === 'string' ? body.entry : ENTRY_FILE);
      if (!files.some((file) => file.path === entry)) throw new Error('The project entry file is missing from the request.');
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    let visualContext;
    try {
      visualContext = normalizeVisualContext(body.visualContext);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    const provider = body.provider && typeof body.provider === 'object' ? body.provider : {};
    if (!provider.type || provider.type === 'local') {
      const groundedMessage = visualContext
        ? `${body.message}\n\nPDF 第 ${visualContext.page} 页圈选文字：${visualContext.selectedText || '未提取到文字'}`
        : body.message;
      sendJson(response, 200, localResumeAgent(groundedMessage, files, entry));
      return;
    }
    if (!['openai', 'anthropic', 'hermes'].includes(provider.type)) {
      sendJson(response, 400, { error: 'Unsupported Agent provider.' });
      return;
    }
    try {
      const { runResumeAgent } = await loadAgentRuntime();
      const result = await runResumeAgent({
        provider,
        message: body.message,
        history: body.history,
        files,
        entry,
        normalizePath: normalizeProjectPath,
        inspectResume,
        compileSnapshot: compileProjectSnapshot,
        visualContext,
        abortSignal: AbortSignal.timeout(REMOTE_AGENT_TIMEOUT_MS),
      });
      sendJson(response, 200, {
        ...normalizeAgentResult(result.rawResult, files, result.mode, result.model, entry),
        provider: result.provider,
        trace: result.trace,
        usage: result.usage,
      });
    } catch (error) {
      const errorMessage = formatAgentProviderError(error, provider.type);
      const isConfigurationError = /API key|Base URL|gateway|配置|401|403|找不到所选模型/.test(errorMessage);
      sendJson(response, isConfigurationError ? 400 : 502, { error: errorMessage });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/agent/apply') {
    const body = await readJson(request);
    if (!Array.isArray(body.edits) || !body.edits.length) {
      sendJson(response, 400, { error: 'At least one edit is required.' });
      return;
    }
    try {
      const requestEntry = normalizeProjectPath(typeof body.entry === 'string' ? body.entry : activeEntry);
      const protectedEntries = new Set([activeEntry, requestEntry]);
      const pendingOperations = [];
      for (const edit of body.edits.slice(0, 20)) {
        const target = projectPath(edit.path);
        if (!isEditableProjectFile(target.relativePath) || typeof edit.baseHash !== 'string') throw new Error('Invalid edit payload.');
        const operation = ['create', 'update', 'delete'].includes(edit.operation)
          ? edit.operation
          : edit.baseExists === false ? 'create' : 'update';
        if (operation === 'delete' && protectedEntries.has(target.relativePath)) {
          throw new Error('不能删除当前 LaTeX 主文档。请先切换主文档。');
        }
        if (operation !== 'delete' && typeof edit.source !== 'string') throw new Error('Invalid edit payload.');
        if (operation !== 'delete' && Buffer.byteLength(edit.source, 'utf8') > MAX_PROJECT_FILE_SIZE) throw new Error(`File is too large: ${target.relativePath}`);
        let currentSource = '';
        let currentExists = true;
        try { currentSource = await fs.readFile(target.absolutePath, 'utf8'); } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          currentExists = false;
        }
        const expectedExists = operation !== 'create';
        if (currentExists !== expectedExists || (expectedExists && hashSource(currentSource) !== edit.baseHash)) {
          sendJson(response, 409, { error: `${target.relativePath} changed after the proposal was created. Ask the Agent to review it again.` });
          return;
        }
        if (operation !== 'delete') {
          const patch = structuredPatch(target.relativePath, target.relativePath, currentSource, edit.source, '', '', { context: 3 });
          if (applyPatch(currentSource, patch) !== edit.source) throw new Error(`Could not validate the patch for ${target.relativePath}.`);
        }
        pendingOperations.push({ operation, path: target.relativePath, absolutePath: target.absolutePath, source: edit.source });
      }
      const trashBatch = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const deleted = [];
      const files = [];
      for (const edit of pendingOperations) {
        if (edit.operation === 'delete') {
          const trashPath = `.cvstudio-trash/${trashBatch}/${edit.path}`;
          const trashTarget = projectPath(trashPath);
          await fs.mkdir(path.dirname(trashTarget.absolutePath), { recursive: true });
          await fs.rename(edit.absolutePath, trashTarget.absolutePath);
          deleted.push({ path: edit.path, trashPath });
        } else {
          await writeProjectFile(edit.path, edit.source);
          files.push(edit.path);
        }
      }
      sendJson(response, 200, { ok: true, files, deleted });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/interview/questions') {
    const role = INTERVIEW_RUBRIC[url.searchParams.get('role')] || INTERVIEW_RUBRIC.behavioral;
    sendJson(response, 200, { role: role.label, questions: role.questions });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/interview/evaluate') {
    const body = await readJson(request);
    if (typeof body.question !== 'string' || typeof body.answer !== 'string') {
      sendJson(response, 400, { error: 'Question and answer must be strings.' });
      return;
    }
    sendJson(response, 200, evaluateInterview(body.question, body.answer, body.role));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/preview.pdf') {
    try {
      const relativePdfPath = pdfPathForEntry(url.searchParams.get('entry') || activeEntry);
      await serveFile(response, projectPath(relativePdfPath).absolutePath, 'application/pdf');
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET') {
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
    if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    await serveFile(response, filePath, contentType);
    return;
  }

  response.writeHead(404);
  response.end('Not found');
}

async function start(options = {}) {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  await loadActiveProject();
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error.' });
      else response.end();
    });
  });

  const requestedPort = Number.isInteger(options.port) ? options.port : PORT;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const url = `http://127.0.0.1:${port}`;
  console.log(`LaTeX Resume Editor: ${url}`);
  return { server, port, url };
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  detectProjectEntry,
  isEditableProjectFile,
  localResumeAgent,
  formatAgentProviderError,
  normalizeAgentResult,
  normalizeVisualContext,
  normalizeProjectPath,
  pdfPathForEntry,
  start,
};
