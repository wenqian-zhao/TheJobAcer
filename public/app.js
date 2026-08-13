import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { oneDark } from '@codemirror/theme-one-dark';
import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist/build/pdf.mjs';
import { animate, stagger } from 'motion';
import {
  ArrowRight, ArrowUp, Briefcase, ChevronLeft, ChevronRight, Code2, createIcons, Download,
  CopyPlus, Database, FilePlus2, FileText, Focus, FolderOpen, FolderPlus, Image, Inbox, KeyRound, Library, List,
  Maximize2, MessageCircle, Minus, Pencil, Pin, Play, RotateCcw, RotateCw, Save,
  ScanLine, Settings2, Sparkles, SquarePen, SunMoon, Trash2, User, X, ZoomIn, ZoomOut,
} from 'lucide';
import interact from 'interactjs';
import { boundsForPoints, rotatePointClockwise, textForPdfRegion, textLineForPdfItem } from './pdf-context.mjs';

const lucideIcons = {
  ArrowRight, ArrowUp, Briefcase, ChevronLeft, ChevronRight, Code2, CopyPlus, Download,
  Database, FilePlus2, FileText, Focus, FolderOpen, FolderPlus, Image, Inbox, KeyRound, Library, Maximize2,
  List, MessageCircle, Minus, Pencil, Pin, Play, RotateCcw, RotateCw, Save, ScanLine,
  Settings2, Sparkles, SquarePen, SunMoon, Trash2, User, X, ZoomIn, ZoomOut,
};
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktopPlatform = new URLSearchParams(window.location.search).get('desktop');
document.body.classList.toggle('desktop-macos', desktopPlatform === 'macos');

function refreshIcons() {
  createIcons({ icons: lucideIcons, attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
}

function setLucideIcon(target, name) {
  const icon = document.createElement('i');
  icon.dataset.lucide = name;
  target.replaceChildren(icon);
  refreshIcons();
}

function animateElement(target, keyframes, options = {}) {
  if (!target || reduceMotion.matches) return null;
  const playback = animate(target, keyframes, { duration: .38, ease: [.22, 1, .36, 1], ...options });
  const clearAnimationStyles = () => {
    target.style.removeProperty('opacity');
    target.style.removeProperty('transform');
  };
  return playback.then(
    () => { clearAnimationStyles(); return true; },
    () => { clearAnimationStyles(); return false; },
  );
}

function animateLanding() {
  const targets = document.querySelectorAll('.landing-topbar, .hero-copy > *, .hero-scene, .feature-item, .landing-footer');
  if (!targets.length || reduceMotion.matches) return;
  const playback = animate(targets, { opacity: [0, 1], y: [14, 0] }, {
    duration: .52,
    delay: stagger(.045),
    ease: [.22, 1, .36, 1],
  });
  playback.then(() => targets.forEach((target) => {
    target.style.removeProperty('opacity');
    target.style.removeProperty('transform');
  }));
}

const editorHost = document.querySelector('#editor');
const saveButton = document.querySelector('#save-button');
const compileButton = document.querySelector('#compile-button');
const saveStatus = document.querySelector('#save-status');
const lineCount = document.querySelector('#line-count');
const compilerLabel = document.querySelector('#compiler-label');
const preview = document.querySelector('#preview');
const previewEmpty = document.querySelector('#preview-empty');
const pdfStage = document.querySelector('#pdf-stage');
const pdfPageShell = document.querySelector('#pdf-page-shell');
const pdfCanvas = document.querySelector('#pdf-canvas');
const pdfLoading = document.querySelector('#pdf-loading');
const pdfPageNumber = document.querySelector('#pdf-page-number');
const pdfPageCount = document.querySelector('#pdf-page-count');
const pdfZoomLabel = document.querySelector('#pdf-zoom-label');
const pdfFitMode = document.querySelector('#pdf-fit-mode');
const pdfAnnotationCanvas = document.querySelector('#pdf-annotation-canvas');
const pdfAnnotationHits = document.querySelector('#pdf-annotation-hits');
const pdfInlineEditor = document.querySelector('#pdf-inline-editor');
const pdfInlineReplacement = document.querySelector('#pdf-inline-replacement');
const previewPane = document.querySelector('.preview-pane');
const consolePanel = document.querySelector('#console');
const consoleOutput = document.querySelector('#console-output');
const landingView = document.querySelector('#landing-view');
const appView = document.querySelector('#app-view');
const workspace = document.querySelector('#workspace');
const fileList = document.querySelector('#file-list');
const activeFileLabel = document.querySelector('#active-file-label');
const sidebarItems = [...document.querySelectorAll('.sidebar-item[data-view]')];
const sidebarToggle = document.querySelector('#sidebar-toggle');
const views = [...document.querySelectorAll('.view')];
const editorActions = [...document.querySelectorAll('.editor-action')];
const viewKicker = document.querySelector('#view-kicker');
const viewTitle = document.querySelector('#view-title');
const viewDescription = document.querySelector('#view-description');
const themeLabel = document.querySelector('#theme-label');
const panelRestore = document.querySelector('#panel-restore');
const agentMessages = document.querySelector('#agent-messages');
const agentInput = document.querySelector('#agent-input');
const agentSendButton = document.querySelector('#agent-send-button');
const agentPane = document.querySelector('#agent-pane');
const agentWindowHeader = document.querySelector('#agent-window-header');
const agentDockPosition = document.querySelector('#agent-dock-position');
const pixelAgentLauncher = document.querySelector('#pixel-agent-launcher');
const agentResizeHandle = document.querySelector('#agent-resize-handle');
const agentVisualContext = document.querySelector('#agent-visual-context');
const agentContextThumbnail = document.querySelector('#agent-context-thumbnail');
const entryFileSelect = document.querySelector('#entry-file');
const projectName = document.querySelector('#project-name');
const cvLibraryDialog = document.querySelector('#cv-library-dialog');
const cvLibraryList = document.querySelector('#cv-library-list');
const cvLibraryCount = document.querySelector('#cv-library-count');
const cvLibraryOpenEditor = document.querySelector('#cv-library-open-editor');
const cvLibrarySelectionStatus = document.querySelector('#cv-library-selection-status');
const cvDuplicateDialog = document.querySelector('#cv-duplicate-dialog');
const cvDuplicateForm = document.querySelector('#cv-duplicate-form');
const intakeBox = document.querySelector('#intake-box');
const intakeFileInput = document.querySelector('#intake-file-input');
const intakeAttachmentsNode = document.querySelector('#intake-attachments');
const intakeReviewEmpty = document.querySelector('#intake-review-empty');
const intakeReviewList = document.querySelector('#intake-review-list');
const intakeReviewActions = document.querySelector('#intake-review-actions');
const intakeReviewStatus = document.querySelector('#intake-review-status');
const materialBankColumns = document.querySelector('#material-bank-columns');
const materialBankLists = {
  job: document.querySelector('#material-bank-list-job'),
  personal: document.querySelector('#material-bank-list-personal'),
};
const materialBankPagination = {
  job: document.querySelector('#material-bank-pagination-job'),
  personal: document.querySelector('#material-bank-pagination-personal'),
};
const materialBankDensity = document.querySelector('#material-bank-density');
const materialBankPageSize = document.querySelector('#material-bank-page-size');
const materialBankSearch = document.querySelector('#material-bank-search');
const materialBankCategory = document.querySelector('#material-bank-category');
const materialBankSelectAll = document.querySelector('#material-bank-select-all');
const materialBankInvertSelection = document.querySelector('#material-bank-invert-selection');
const materialBankClearSelection = document.querySelector('#material-bank-clear-selection');
const materialBankSelectionStatus = document.querySelector('#material-bank-selection-status');
const materialBankDeleteSelected = document.querySelector('#material-bank-delete-selected');
const intakeGenerateDialog = document.querySelector('#intake-generate-dialog');
const intakeGenerateForm = document.querySelector('#intake-generate-form');
const intakeGenerateSetup = document.querySelector('#intake-generate-setup');
const intakeGenerateProgress = document.querySelector('#intake-generate-progress');
const intakeGenerateFit = document.querySelector('#intake-generate-fit');
const intakeGenerateTemplates = document.querySelector('#intake-generate-templates');
const resizeHud = document.querySelector('#resize-hud');
const editorTheme = new Compartment();
const viewMeta = {
  'editor-view': ['LATEX EDITOR', '编辑器', '编辑源码，编译并查看你的简历。'],
  'intake-view': ['MATERIAL LIBRARY · INBOX', '收件箱', '录入新材料，由 Agent 提取并整理为可复用信息。'],
  'bank-view': ['MATERIAL LIBRARY · INFORMATION BANK', '信息银行', '查看已入库信息的基本内容、类别和录入日期。'],
  'interview-view': ['MOCK INTERVIEW', '模拟面试', '用几轮练习，把回答说得更清楚。'],
};

let projectFiles = new Map();
let projectEntries = [];
let cvLibrary = [];
let selectedCvProjectRoot = '';
let intakeAttachments = [];
let intakeSegments = [];
let intakeBank = { items: [], counts: { job: 0, personal: 0 } };
let intakeBankKind = 'personal';
let intakeBankDensity = 'compact';
let intakeBankPageSize = 10;
let intakeBankPages = { job: 1, personal: 1 };
let materialBankSearchQuery = '';
let materialBankCategoryFilter = 'all';
let selectedMaterialIds = new Set();
let expandedMaterialIds = new Set();
let collapsedMaterialIds = new Set();
let materialBankColumnAnimations = [];
let materialBankTransitionToken = 0;
let intakeGenerationItemIds = [];
let intakeGenerationActive = false;
let intakeGenerationAbortController = null;
let intakeAnalyzedSource = null;
let intakeRawHtml = '';
let currentProjectRoot = '';
let collapsedDirectories = new Set();
let savedSources = new Map();
let activeFile = 'resume.tex';
let entryFile = 'resume.tex';
let activeView = 'landing-view';
let viewTransitionToken = 0;
let agentWindowState = null;
let agentConversation = [];
let agentEnvironmentKeys = {};
let editorView = null;
let interviewState = { questions: [], index: 0, awaitingNext: false, complete: false };
let pdfDocument = null;
let pdfRenderTask = null;
let pdfPage = 1;
let pdfScale = 1;
let pdfRotation = 0;
let pdfMode = 'width';
let pdfUrl = '';
let pdfResizeTimer = null;
let pdfRenderVersion = 0;
let pdfTextItems = [];
let pdfAnnotations = [];
let pdfAnnotationDraft = null;
let pdfAnnotationDrawing = false;
let pdfReviewActive = false;
let pdfInlineEditActive = false;
let pdfInlineSelection = null;
let pdfModeBeforeReview = 'width';
let activeVisualContext = null;
let nextAnnotationId = 1;

const GLOBAL_AI_SETTINGS_KEY = 'cv-studio-global-ai-settings';
const CV_LIBRARY_KEY = 'cv-studio-project-library';

const lightEditorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#1d1d1b', color: '#f1eee7' },
  '.cm-content': { caretColor: '#c28c73', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.72', padding: '14px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c28c73' },
  '.cm-gutters': { backgroundColor: '#181816', color: '#69665e', borderRight: '1px solid #2d2b27' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#262520' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#5d421f !important' },
});

function initializeCodeEditor() {
  editorView = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        StreamLanguage.define(stex),
        keymap.of([indentWithTab]),
        editorTheme.of(lightEditorTheme),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) updateEditorState();
        }),
      ],
    }),
    parent: editorHost,
  });
}

function getEditorValue() {
  return editorView?.state.doc.toString() || '';
}

function setEditorValue(value) {
  const nextValue = typeof value === 'string' ? value : '';
  if (!editorView) return;
  editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: nextValue } });
}

function focusEditor() {
  editorView?.focus();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isTextEntryTarget(target) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function updateEditorState() {
  const value = getEditorValue();
  const lines = value.split('\n').length;
  lineCount.textContent = `${lines} 行`;
  saveStatus.textContent = value === savedSources.get(activeFile) ? '已保存' : '未保存';
}

function setBusy(isBusy) {
  saveButton.disabled = isBusy;
  compileButton.disabled = isBusy;
  compileButton.querySelector('.button-label').textContent = isBusy ? '编译中' : '编译';
}

function showError(message, details = '') {
  consoleOutput.textContent = details ? `${message}\n\n${details}` : message;
  consolePanel.hidden = false;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const rawBody = await response.text();
  let body = {};
  let responseWasJson = false;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
      responseWasJson = true;
    } catch {
      body = { error: rawBody.trim() || 'The server returned an invalid response.' };
    }
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed.');
    error.details = body.details || '';
    error.status = response.status;
    error.responseWasJson = responseWasJson;
    throw error;
  }
  if (rawBody && !responseWasJson) throw new Error('The server returned a non-JSON response.');
  return body;
}

function syncActiveFile() {
  if (!activeFile) return;
  projectFiles.set(activeFile, getEditorValue());
}

function hasUnsavedProjectFiles() {
  syncActiveFile();
  return [...projectFiles].some(([filePath, source]) => source !== savedSources.get(filePath));
}

function fileKind(filePath) {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return extension && extension.length <= 4 ? extension : 'file';
}

function renderFileList() {
  fileList.replaceChildren();
  const directories = new Set();
  projectEntries.forEach((file) => {
    const parts = file.path.split('/');
    parts.pop();
    let current = '';
    parts.forEach((part) => {
      current = current ? `${current}/${part}` : part;
      directories.add(current);
    });
  });
  const rows = [
    ...[...directories].map((filePath) => ({ path: filePath, directory: true })),
    ...projectEntries,
  ].sort((a, b) => a.path.localeCompare(b.path) || Number(Boolean(b.directory)) - Number(Boolean(a.directory)))
    .filter((row) => ![...collapsedDirectories].some((directory) => row.path !== directory && row.path.startsWith(`${directory}/`)));

  rows.forEach((file) => {
    const filePath = file.path;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = file.directory ? 'file-list-item directory' : 'file-list-item';
    item.classList.toggle('active', filePath === activeFile);
    item.setAttribute('role', file.directory ? 'presentation' : 'option');
    item.setAttribute('aria-selected', String(filePath === activeFile));
    item.setAttribute('aria-label', filePath);
    item.title = filePath;
    const segments = filePath.split('/');
    const fileName = segments.pop();
    const directory = segments.join('/') || 'PROJECT ROOT';
    const label = element('span', 'file-label');
    label.append(element('strong', '', fileName), element('small', '', file.directory ? `${segments.length + 1} LEVEL` : directory));
    item.style.setProperty('--tree-depth', String(segments.length));
    item.append(element('span', 'file-icon', file.directory ? (collapsedDirectories.has(filePath) ? '›' : '⌄') : fileKind(filePath)), label);
    if (file.directory) {
      item.setAttribute('aria-expanded', String(!collapsedDirectories.has(filePath)));
      item.addEventListener('click', () => {
        if (collapsedDirectories.has(filePath)) collapsedDirectories.delete(filePath);
        else collapsedDirectories.add(filePath);
        renderFileList();
      });
    }
    else if (!file.editable) {
      item.classList.add('binary');
      item.disabled = true;
      item.title = `${filePath} · 二进制资源 · ${Math.max(1, Math.round(file.size / 1024))} KB`;
    } else item.addEventListener('click', () => selectProjectFile(filePath));
    fileList.append(item);
  });
}

function selectProjectFile(filePath) {
  if (!projectFiles.has(filePath) || filePath === activeFile) return;
  syncActiveFile();
  activeFile = filePath;
  setEditorValue(projectFiles.get(filePath) || '');
  activeFileLabel.textContent = filePath;
  renderFileList();
  updateEditorState();
  focusEditor();
}

async function createProjectFile() {
  const filePath = window.prompt('新建文件路径', 'sections/experience.tex');
  if (!filePath) return;
  try {
    const result = await request('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, source: '' }),
    });
    projectFiles.set(result.path, '');
    savedSources.set(result.path, '');
    projectEntries.push({ path: result.path, size: 0, editable: true, source: '' });
    selectProjectFile(result.path);
    renderFileList();
  } catch (error) {
    showError('无法新建文件', error.message);
  }
}

function loadCvLibrary() {
  try {
    const stored = JSON.parse(localStorage.getItem(CV_LIBRARY_KEY) || '[]');
    cvLibrary = Array.isArray(stored)
      ? stored.filter((item) => item && typeof item.root === 'string' && item.root).slice(0, 24)
      : [];
  } catch {
    cvLibrary = [];
  }
}

function persistCvLibrary() {
  localStorage.setItem(CV_LIBRARY_KEY, JSON.stringify(cvLibrary.slice(0, 24)));
}

function rememberCvProject(state) {
  if (!state?.root) return;
  currentProjectRoot = state.root;
  const record = {
    root: state.root,
    name: state.name || state.root.split(/[\\/]/).filter(Boolean).at(-1) || 'CV project',
    entry: state.entry || 'resume.tex',
    lastOpened: Date.now(),
  };
  cvLibrary = [record, ...cvLibrary.filter((item) => item.root !== record.root)].slice(0, 24);
  persistCvLibrary();
  renderCvLibrary();
}

function updateCurrentCvLibraryEntry() {
  const record = cvLibrary.find((item) => item.root === currentProjectRoot);
  if (!record) return;
  record.entry = entryFile;
  record.lastOpened = Date.now();
  persistCvLibrary();
  renderCvLibrary();
}

function renderCvLibrary() {
  if (!cvLibraryList) return;
  cvLibraryList.replaceChildren();
  cvLibraryCount.textContent = `${cvLibrary.length} 个独立项目`;
  const selectedProject = cvLibrary.find((project) => project.root === selectedCvProjectRoot);
  cvLibraryOpenEditor.disabled = !selectedProject;
  cvLibraryOpenEditor.title = selectedProject ? `在编辑器中打开 ${selectedProject.name}` : '请先选择一份 CV';
  cvLibraryOpenEditor.setAttribute('aria-label', cvLibraryOpenEditor.title);
  cvLibrarySelectionStatus.textContent = selectedProject
    ? `已选择“${selectedProject.name}”`
    : '选择一份 CV 后，即可进入简历编辑器。';
  if (!cvLibrary.length) {
    cvLibraryList.append(element('p', 'cv-library-empty', '还没有保存的 CV 项目。导入文件夹或复制当前 CV 开始。'));
    return;
  }
  cvLibrary.forEach((project) => {
    const current = project.root === currentProjectRoot;
    const selected = project.root === selectedCvProjectRoot;
    const card = element('div', `cv-project-card${current ? ' current' : ''}${selected ? ' selected' : ''}`);
    card.setAttribute('role', 'listitem');
    const open = element('button', 'cv-project-open');
    open.type = 'button';
    open.setAttribute('aria-pressed', String(selected));
    open.setAttribute('aria-label', current ? `选择当前 CV：${project.name}` : `选择 CV：${project.name}`);
    const copy = element('span', 'cv-project-copy');
    copy.append(element('strong', '', project.name), element('small', '', project.root));
    open.append(element('span', 'cv-project-mark', selected ? '✓' : (current ? '●' : '○')), copy, element('span', 'cv-project-entry', project.entry || 'resume.tex'));
    open.addEventListener('click', () => {
      selectedCvProjectRoot = project.root;
      renderCvLibrary();
      cvLibraryOpenEditor.focus();
    });
    const remove = element('button', 'cv-project-remove', '×');
    remove.type = 'button';
    remove.disabled = current;
    remove.setAttribute('aria-label', `从简历库移除 ${project.name}`);
    remove.title = current ? '当前 CV 不能从列表移除' : '仅从列表移除，不删除磁盘文件';
    remove.addEventListener('click', () => {
      cvLibrary = cvLibrary.filter((item) => item.root !== project.root);
      if (selectedCvProjectRoot === project.root) selectedCvProjectRoot = '';
      persistCvLibrary();
      renderCvLibrary();
    });
    card.append(open, remove);
    cvLibraryList.append(card);
  });
}

async function prepareProjectSwitch() {
  if (!hasUnsavedProjectFiles()) return true;
  if (!window.confirm('当前 CV 有未保存修改。保存后再切换项目？')) return false;
  return save();
}

async function switchCvProject(project) {
  const root = project?.root;
  if (!root) return false;
  if (root === currentProjectRoot) return true;
  if (!await prepareProjectSwitch()) return false;
  try {
    await openProjectFolder(root, project.entry);
    return true;
  } catch (error) {
    showError('无法切换 CV', error.message);
    return false;
  }
}

async function openSelectedCvInEditor() {
  const project = cvLibrary.find((item) => item.root === selectedCvProjectRoot);
  if (!project) return;
  cvLibraryOpenEditor.disabled = true;
  if (!await switchCvProject(project)) {
    renderCvLibrary();
    return;
  }
  cvLibraryDialog.close();
  await switchView('editor-view');
}

function openCvLibrary() {
  selectedCvProjectRoot = '';
  renderCvLibrary();
  cvLibraryDialog.showModal();
  window.setTimeout(() => cvLibraryDialog.querySelector('button:not(:disabled)')?.focus(), 60);
}

function openCvDuplicateDialog() {
  const parent = currentProjectRoot.replace(/[\\/][^\\/]+$/, '');
  document.querySelector('#cv-duplicate-name').value = `${projectName.textContent || 'resume'}-copy`;
  document.querySelector('#cv-duplicate-parent').value = parent;
  cvDuplicateDialog.showModal();
  window.setTimeout(() => document.querySelector('#cv-duplicate-name').select(), 60);
}

async function duplicateCurrentCv(event) {
  event.preventDefault();
  if (hasUnsavedProjectFiles() && !await save()) return;
  const submit = document.querySelector('#cv-duplicate-submit');
  submit.disabled = true;
  try {
    const state = await request('/api/project/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentPath: document.querySelector('#cv-duplicate-parent').value.trim(),
        name: document.querySelector('#cv-duplicate-name').value.trim(),
        entry: entryFile,
        files: [...projectFiles.entries()].map(([path, source]) => ({ path, source })),
      }),
    });
    applyProjectState(state);
    cvDuplicateDialog.close();
    if (cvLibraryDialog.open) renderCvLibrary();
  } catch (error) {
    showError('无法复制 CV', error.message);
  } finally {
    submit.disabled = false;
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

function isTextualIntakeFile(file) {
  return file.type.startsWith('text/')
    || /\.(?:txt|md|tex|bib|json|ya?ml|csv|tsv|log)$/i.test(file.name);
}

function isPdfIntakeFile(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

async function extractPdfIntakeData(file) {
  let pdf;
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
      iccUrl: '/pdfjs/iccs/',
    });
    pdf = await loadingTask.promise;
    const textPages = [];
    const previewImages = [];
    const pageLimit = Math.min(pdf.numPages, 20);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => typeof item.str === 'string' ? item.str : '').filter(Boolean).join(' ').trim();
      if (pageText) textPages.push(`[PDF page ${pageNumber}]\n${pageText}`);
      if (pageNumber <= 3) {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.35, 1_100 / Math.max(1, baseViewport.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
        previewImages.push({ dataUrl: canvas.toDataURL('image/jpeg', .74), mimeType: 'image/jpeg', page: pageNumber });
      }
      page.cleanup();
    }
    return {
      text: textPages.join('\n\n').slice(0, 40_000),
      previewImages,
      pageCount: pdf.numPages,
      extractionError: '',
    };
  } catch (error) {
    return { text: '', previewImages: [], pageCount: 0, extractionError: error.message || 'PDF extraction failed.' };
  } finally {
    if (pdf) await pdf.destroy();
  }
}

async function addIntakeFiles(files) {
  const incoming = [...files].slice(0, Math.max(0, 20 - intakeAttachments.length));
  for (const file of incoming) {
    if (file.size > 5_000_000) throw new Error(`${file.name || '文件'} 超过 5 MB。`);
    const currentSize = intakeAttachments.reduce((total, attachment) => total + attachment.size, 0);
    if (currentSize + file.size > 16_000_000) throw new Error('全部附件不能超过 16 MB。');
    const pdfData = isPdfIntakeFile(file) ? await extractPdfIntakeData(file) : null;
    const dataUrl = await fileAsDataUrl(file);
    const extractedText = pdfData?.text || (isTextualIntakeFile(file) ? (await file.text()).slice(0, 40_000) : '');
    intakeAttachments.push({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: file.name || `pasted-${intakeAttachments.length + 1}`,
      mimeType: isPdfIntakeFile(file) ? 'application/pdf' : file.type || 'application/octet-stream',
      size: file.size,
      dataUrl,
      text: extractedText,
      previewImages: pdfData?.previewImages || [],
      pageCount: pdfData?.pageCount || 0,
      extractionError: pdfData?.extractionError || '',
    });
  }
  renderIntakeAttachments();
}

function renderIntakeAttachments() {
  intakeAttachmentsNode.replaceChildren();
  intakeAttachments.forEach((attachment, index) => {
    const chip = element('article', 'intake-attachment');
    if (attachment.mimeType.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = attachment.dataUrl;
      image.alt = '';
      chip.append(image);
    } else chip.append(element('span', 'intake-file-mark', attachment.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'));
    const copy = element('span', 'intake-attachment-copy');
    const extractionLabel = attachment.mimeType === 'application/pdf'
      ? attachment.text
        ? `已提取 ${attachment.text.length} 字 · ${attachment.pageCount || '?'} 页`
        : attachment.previewImages?.length
          ? `扫描 PDF · ${attachment.previewImages.length} 页视觉预览`
          : 'PDF 尚未提取'
      : attachment.mimeType.startsWith('image/')
        ? '等待视觉模型提取'
        : attachment.text ? `已读取 ${attachment.text.length} 字` : attachment.mimeType;
    copy.append(element('strong', '', attachment.name), element('small', '', `${extractionLabel} · ${Math.max(1, Math.round(attachment.size / 1024))} KB`));
    const remove = element('button', 'intake-attachment-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `移除附件 ${attachment.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      intakeAttachments.splice(index, 1);
      renderIntakeAttachments();
    });
    chip.append(copy, remove);
    intakeAttachmentsNode.append(chip);
  });
}

function resetIntakeReview(clearInput = true) {
  intakeSegments = [];
  intakeAnalyzedSource = null;
  intakeReviewList.replaceChildren();
  intakeReviewEmpty.hidden = false;
  intakeReviewActions.hidden = true;
  if (clearInput) {
    intakeBox.value = '';
    intakeRawHtml = '';
    intakeAttachments = [];
    renderIntakeAttachments();
    intakeReviewStatus.textContent = '尚未分析';
  }
}

function intakeReviewAttachments() {
  return intakeAnalyzedSource?.attachments || intakeAttachments;
}

function intakePhotoAttachmentIndexes(item = {}) {
  const attachments = intakeReviewAttachments();
  return (Array.isArray(item.attachmentIndexes) ? item.attachmentIndexes : [])
    .filter((index) => /^image\/(?:png|jpeg)$/.test(attachments[index]?.mimeType || ''));
}

function hasExtractedIntakeContent(item = {}) {
  if (typeof item.content === 'string' && item.content.trim()) return true;
  const fields = item.fields || {};
  if (Object.values(fields.profile || {}).some((value) => typeof value === 'string' && value.trim())) return true;
  if (fields.profile?.isPhoto === true && intakePhotoAttachmentIndexes(item).length) return true;
  if (['experiences', 'education', 'projects', 'skills'].some((key) => Array.isArray(fields[key]) && fields[key].length)) return true;
  if (item.kind === 'job') {
    return Object.values(fields.job || {}).some((value) => Array.isArray(value) ? value.length : typeof value === 'string' && value.trim());
  }
  return Boolean(fields.personal?.label?.trim() || fields.personal?.details?.trim());
}

function appendStructuredGroup(root, title, records, renderRecord, compact) {
  if (!Array.isArray(records) || !records.length) return 0;
  const limit = compact ? 2 : 5;
  const group = element('section', 'structured-group');
  group.append(element('h4', '', title));
  records.slice(0, limit).forEach((record) => group.append(renderRecord(record)));
  if (records.length > limit) group.append(element('small', 'structured-more', `另有 ${records.length - limit} 条`));
  root.append(group);
  return records.length;
}

function structuredRecord(title, meta, details = []) {
  const record = element('div', 'structured-record');
  record.append(element('strong', '', title || '未命名条目'));
  if (meta) record.append(element('small', '', meta));
  const cleaned = (Array.isArray(details) ? details : []).filter(Boolean);
  if (cleaned.length) record.append(element('p', '', cleaned.slice(0, 3).join(' · ')));
  return record;
}

function renderStructuredMaterial(item, compact = false) {
  const fields = item?.fields || {};
  const root = element('div', `structured-material structured-${item?.kind || 'personal'}${compact ? ' compact' : ''}`);
  let facts = 0;
  if (item?.kind === 'job') {
    const job = fields.job || {};
    if (job.title || job.company || job.location || job.employmentType) {
      const hero = element('div', 'structured-hero');
      hero.append(element('strong', '', job.title || item.title || '职位'));
      const meta = [job.company, job.location, job.employmentType].filter(Boolean).join(' · ');
      if (meta) hero.append(element('span', '', meta));
      root.append(hero);
      facts += 1;
    }
    if (job.description) {
      root.append(element('p', 'structured-description', job.description));
      facts += 1;
    }
    const requirements = Array.isArray(job.requirements) ? job.requirements : [];
    if (requirements.length) {
      const group = element('section', 'structured-group');
      group.append(element('h4', '', '任职要求'));
      const list = element('ul', 'structured-list');
      requirements.slice(0, compact ? 3 : 8).forEach((requirement) => list.append(element('li', '', requirement)));
      group.append(list);
      root.append(group);
      facts += requirements.length;
    }
    const keywords = Array.isArray(job.keywords) ? job.keywords : [];
    if (keywords.length) {
      const chips = element('div', 'structured-chips');
      keywords.slice(0, compact ? 6 : 15).forEach((keyword) => chips.append(element('span', '', keyword)));
      root.append(chips);
      facts += keywords.length;
    }
  } else {
    const profile = fields.profile || {};
    const contacts = [profile.email, profile.phone, profile.location, profile.website, profile.linkedin, profile.github].filter(Boolean);
    if (profile.name || profile.headline || contacts.length || profile.summary) {
      const hero = element('div', 'structured-hero');
      hero.append(element('strong', '', profile.name || item.title || '个人资料'));
      if (profile.headline) hero.append(element('span', '', profile.headline));
      if (contacts.length) {
        const chips = element('div', 'structured-chips');
        contacts.slice(0, compact ? 4 : 8).forEach((contact) => chips.append(element('span', '', contact)));
        hero.append(chips);
      }
      if (profile.summary) hero.append(element('p', 'structured-description', profile.summary));
      root.append(hero);
      facts += 1 + contacts.length;
    }
    facts += appendStructuredGroup(root, '工作经历', fields.experiences, (record) => structuredRecord(
      [record.role, record.organization].filter(Boolean).join(' · '),
      [record.dates, record.location].filter(Boolean).join(' · '), record.bullets,
    ), compact);
    facts += appendStructuredGroup(root, '项目', fields.projects, (record) => structuredRecord(
      [record.name, record.role].filter(Boolean).join(' · '),
      [record.dates, record.url].filter(Boolean).join(' · '), record.bullets,
    ), compact);
    facts += appendStructuredGroup(root, '教育', fields.education, (record) => structuredRecord(
      [record.degree, record.institution].filter(Boolean).join(' · '),
      [record.dates, record.location].filter(Boolean).join(' · '), record.details,
    ), compact);
    if (Array.isArray(fields.skills) && fields.skills.length) {
      const skills = element('section', 'structured-group');
      skills.append(element('h4', '', '技能'));
      fields.skills.slice(0, compact ? 3 : 8).forEach((skill) => {
        const row = element('div', 'structured-skill');
        row.append(element('strong', '', skill.category || '技能'), element('span', '', (skill.items || []).join(' · ')));
        skills.append(row);
      });
      root.append(skills);
      facts += fields.skills.length;
    }
    const personal = fields.personal || {};
    if (personal.label || personal.details) {
      const categoryLabel = PERSONAL_CATEGORY_META[personal.category]?.[0] || '';
      root.append(structuredRecord(personal.label || categoryLabel || '补充资料', personal.category !== 'other' ? categoryLabel : '', [personal.details]));
      facts += 1;
    }
  }
  return facts ? root : null;
}

function updateIntakeCommitAvailability() {
  const unreadable = intakeSegments.filter((segment) => !hasExtractedIntakeContent(segment)).length;
  const button = document.querySelector('#intake-commit');
  button.disabled = !intakeSegments.length || unreadable > 0;
  button.title = unreadable ? `${unreadable} 条材料尚未提取出内容` : '把已提取内容写入素材银行';
}

function updateIntakeSegmentExtractionState(segment, card, badge, warning) {
  const extracted = hasExtractedIntakeContent(segment);
  segment.extractionStatus = extracted ? 'extracted' : 'unreadable';
  card.classList.toggle('extracted', extracted);
  card.classList.toggle('unreadable', !extracted);
  badge.className = `intake-confidence ${segment.extractionStatus}`;
  badge.textContent = extracted
    ? `已提取 · ${Math.round((segment.confidence || 0) * 100)}%`
    : '未提取 · 不能入库';
  warning.hidden = extracted;
  updateIntakeCommitAvailability();
}

function renderIntakeReview() {
  intakeReviewList.replaceChildren();
  intakeReviewEmpty.hidden = intakeSegments.length > 0;
  intakeReviewActions.hidden = !intakeSegments.length;
  const kindOptions = [
    ['job', '职位描述'],
    ['personal', '个人信息'],
  ];
  intakeSegments.forEach((segment, index) => {
    const card = element('article', 'intake-review-card');
    const heading = element('div', 'intake-review-card-heading');
    const kind = document.createElement('select');
    kind.className = `intake-kind-select kind-${segment.kind}`;
    kind.setAttribute('aria-label', `第 ${index + 1} 条材料分类`);
    kind.replaceChildren(...kindOptions.map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = segment.kind === value;
      return option;
    }));
    kind.addEventListener('change', () => {
      segment.kind = kind.value;
      if (segment.kind !== 'personal' && segment.fields?.profile) segment.fields.profile.isPhoto = false;
      renderIntakeReview();
    });
    const category = segment.kind === 'personal'
      ? element('span', 'intake-category-badge', materialKindLabel(segment))
      : null;
    const confidence = element('span', 'intake-confidence');
    const remove = element('button', 'intake-segment-remove', '移除');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      intakeSegments.splice(index, 1);
      renderIntakeReview();
    });
    heading.append(kind);
    if (category) heading.append(category);
    heading.append(confidence, remove);
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'intake-review-title';
    title.value = segment.title || '';
    title.maxLength = 200;
    title.setAttribute('aria-label', `第 ${index + 1} 条材料标题`);
    title.addEventListener('input', () => { segment.title = title.value; });
    const summary = document.createElement('textarea');
    summary.className = 'intake-review-summary';
    summary.rows = 2;
    summary.value = segment.summary || '';
    summary.setAttribute('aria-label', `第 ${index + 1} 条材料摘要`);
    summary.addEventListener('input', () => { segment.summary = summary.value; });
    const structured = renderStructuredMaterial(segment);
    const photoAttachmentIndexes = segment.kind === 'personal' ? intakePhotoAttachmentIndexes(segment) : [];
    const photoControl = photoAttachmentIndexes.length ? element('label', 'intake-photo-control') : null;
    if (photoControl) {
      const attachment = intakeReviewAttachments()[photoAttachmentIndexes[0]];
      const preview = document.createElement('img');
      preview.src = attachment.dataUrl;
      preview.alt = '';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = segment.fields?.profile?.isPhoto === true;
      checkbox.setAttribute('aria-label', `将第 ${index + 1} 条材料的图片设为个人照片`);
      const copy = element('span', '');
      copy.append(element('strong', '', '设为个人照片'), element('small', '', '仅用于明确的本人头像；截图、证书和作品图请勿勾选'));
      checkbox.addEventListener('change', () => {
        segment.fields ||= {};
        segment.fields.profile ||= {};
        segment.fields.profile.isPhoto = checkbox.checked;
        if (checkbox.checked && !segment.title?.trim()) segment.title = '个人照片';
        updateIntakeSegmentExtractionState(segment, card, confidence, warning);
      });
      photoControl.append(preview, checkbox, copy);
    }
    const warning = element('p', 'intake-extraction-warning', '这个来源还没有可复用内容。请启用视觉模型、补写可靠文字；如果它确实是本人头像，也可以明确勾选“设为个人照片”。');
    const content = document.createElement('textarea');
    content.className = 'intake-review-content';
    content.rows = 5;
    content.value = segment.content || '';
    content.placeholder = '从来源提取的文字、可靠转录或视觉描述（原始附件本身不会替代这部分内容）';
    content.setAttribute('aria-label', `第 ${index + 1} 条材料内容`);
    content.addEventListener('input', () => {
      segment.content = content.value;
      updateIntakeSegmentExtractionState(segment, card, confidence, warning);
    });
    const attachmentNote = segment.attachmentIndexes?.length
      ? element('small', 'intake-segment-assets', `关联 ${segment.attachmentIndexes.length} 个原始附件`)
      : null;
    card.append(heading, title);
    if (photoControl) card.append(photoControl);
    if (structured) card.append(structured);
    card.append(summary, warning, content);
    if (attachmentNote) card.append(attachmentNote);
    intakeReviewList.append(card);
    updateIntakeSegmentExtractionState(segment, card, confidence, warning);
  });
  updateIntakeCommitAvailability();
}

async function analyzeIntake() {
  const text = intakeBox.value.trim();
  if (!text && !intakeAttachments.length) {
    showError('没有可整理的材料', '请先粘贴文字、截图或文件。');
    return;
  }
  const button = document.querySelector('#intake-analyze');
  button.disabled = true;
  intakeReviewStatus.textContent = 'Agent 正在识别…';
  const analysisAttachments = intakeAttachments.map(({ name, mimeType, dataUrl, text: extractedText, previewImages }) => ({
    name, mimeType, dataUrl, text: extractedText, previewImages,
  }));
  const analysisSource = {
    text,
    html: intakeRawHtml,
    attachments: analysisAttachments.map(({ name, mimeType, dataUrl, text: extractedText }) => ({ name, mimeType, dataUrl, text: extractedText })),
  };
  try {
    const result = await request('/api/intake/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        attachments: analysisAttachments,
        provider: agentSettings(),
      }),
    });
    intakeSegments = Array.isArray(result.segments) ? result.segments : [];
    intakeAnalyzedSource = analysisSource;
    intakeReviewStatus.textContent = result.mode === 'agent'
      ? `${result.model || result.provider} · ${intakeSegments.length} 条`
      : `本地初分 · ${intakeSegments.length} 条`;
    renderIntakeReview();
  } catch (error) {
    intakeReviewStatus.textContent = '分析失败';
    showError('无法整理这批材料', error.message);
  } finally {
    button.disabled = false;
  }
}

async function commitIntake() {
  if (!intakeSegments.length) return;
  const unreadable = intakeSegments.filter((segment) => !hasExtractedIntakeContent(segment));
  if (unreadable.length) {
    showError('有材料尚未完成提取', `${unreadable.length} 条材料只有原始附件或空字段。请用视觉模型重新分析、手动补充可靠内容，或移除后再入库。`);
    updateIntakeCommitAvailability();
    return;
  }
  const button = document.querySelector('#intake-commit');
  button.disabled = true;
  const source = intakeAnalyzedSource || {
    text: intakeBox.value.trim(),
    html: intakeRawHtml,
    attachments: intakeAttachments.map(({ name, mimeType, dataUrl, text }) => ({ name, mimeType, dataUrl, text })),
  };
  try {
    const result = await request('/api/intake/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...source,
        segments: intakeSegments,
      }),
    });
    intakeBank = result.bank;
    const savedCount = result.saved?.length || intakeSegments.length;
    resetIntakeReview(true);
    intakeReviewStatus.textContent = `已保存 ${savedCount} 条`;
    renderMaterialBank();
    await switchView('bank-view');
  } catch (error) {
    showError('无法保存到素材银行', error.message);
  } finally {
    button.disabled = false;
  }
}

const PERSONAL_CATEGORY_META = {
  profile: ['个人信息', 0],
  experience: ['工作经历', 1],
  project: ['项目经历', 2],
  education: ['教育经历', 3],
  skill: ['专业技能', 4],
  award: ['荣誉和奖项', 5],
  extracurricular: ['课外活动', 6],
  social_practice: ['社会实践', 7],
  talk: ['演讲和讲座', 8],
  publication: ['论文发表', 9],
};

const LEGACY_PERSONAL_CATEGORY_ALIASES = {
  contact: 'profile',
  summary: 'profile',
  photo: 'profile',
  other: 'profile',
};

function materialPersonalCategory(item) {
  const fields = item?.fields || {};
  const explicit = fields.personal?.category;
  if (PERSONAL_CATEGORY_META[explicit]) return explicit;
  if (Object.values(fields.profile || {}).some(Boolean)) return 'profile';
  if (fields.experiences?.length) return 'experience';
  if (fields.projects?.length) return 'project';
  if (fields.education?.length) return 'education';
  if (fields.skills?.length) return 'skill';
  return LEGACY_PERSONAL_CATEGORY_ALIASES[explicit] || 'profile';
}

function materialKindLabel(item) {
  return item.kind === 'job' ? '职位描述' : PERSONAL_CATEGORY_META[materialPersonalCategory(item)][0];
}

function materialPriority(item) {
  if (item.kind === 'job') return 50;
  return PERSONAL_CATEGORY_META[materialPersonalCategory(item)][1];
}

function materialRecordedDate(item) {
  const value = item.recordedAt || item.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : date.toLocaleDateString('zh-CN');
}

function materialSearchValues(value) {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(materialSearchValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(materialSearchValues);
  return [];
}

function materialMatchesCurrentQuery(item) {
  if (materialBankCategoryFilter !== 'all') {
    if (materialBankCategoryFilter === 'job') {
      if (item.kind !== 'job') return false;
    } else if (item.kind !== 'personal' || materialPersonalCategory(item) !== materialBankCategoryFilter) return false;
  }
  const terms = materialBankSearchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const corpus = [
    item.title,
    item.summary,
    item.content,
    materialKindLabel(item),
    materialRecordedDate(item),
    ...materialSearchValues(item.fields),
  ].filter(Boolean).join('\n').toLocaleLowerCase();
  return terms.every((term) => corpus.includes(term));
}

function sortedMaterialBankItems() {
  return [...(Array.isArray(intakeBank.items) ? intakeBank.items : [])]
    .sort((left, right) => materialPriority(left) - materialPriority(right)
      || String(right.recordedAt || right.createdAt || '').localeCompare(String(left.recordedAt || left.createdAt || '')));
}

function currentMaterialBankResults() {
  return sortedMaterialBankItems().filter(materialMatchesCurrentQuery);
}

function setMaterialSelected(itemId, selected) {
  if (selected) selectedMaterialIds.add(itemId);
  else selectedMaterialIds.delete(itemId);
  document.querySelectorAll('.material-card[data-material-id]').forEach((card) => {
    if (card.dataset.materialId !== itemId) return;
    card.classList.toggle('selected', selected);
    const checkbox = card.querySelector('.material-card-checkbox');
    if (checkbox) checkbox.checked = selected;
  });
  syncMaterialBankSelectionControls();
}

function syncMaterialBankSelectionControls() {
  const items = Array.isArray(intakeBank.items) ? intakeBank.items : [];
  const validIds = new Set(items.map((item) => item.id));
  selectedMaterialIds = new Set([...selectedMaterialIds].filter((id) => validIds.has(id)));
  const results = currentMaterialBankResults();
  const selectedItems = items.filter((item) => selectedMaterialIds.has(item.id));
  const selectedPersonalCount = selectedItems.filter((item) => item.kind === 'personal').length;
  materialBankSelectionStatus.textContent = `当前 ${results.length} 条 · 已选 ${selectedItems.length} 条（个人信息 ${selectedPersonalCount} 条）`;
  materialBankSelectAll.disabled = !results.length || results.every((item) => selectedMaterialIds.has(item.id));
  materialBankInvertSelection.disabled = !results.length;
  materialBankClearSelection.disabled = !selectedItems.length;
  materialBankDeleteSelected.disabled = !selectedItems.length;
  const generateButton = document.querySelector('#intake-generate-cv');
  generateButton.disabled = !selectedPersonalCount;
  generateButton.title = selectedPersonalCount ? `使用已选的 ${selectedPersonalCount} 条个人信息生成 CV` : '请先选择至少一条个人信息';
}

function materialPlainText(item) {
  if (item.content?.trim()) return item.content.trim();
  const fields = item.fields || {};
  if (item.kind === 'job') {
    const job = fields.job || {};
    return [
      [job.title, job.company, job.location, job.employmentType].filter(Boolean).join(' · '),
      job.description,
      ...(job.requirements || []),
      ...(job.keywords || []),
    ].filter(Boolean).join('\n').trim() || '暂无可复制的用户原文';
  }
  if (fields.personal?.details?.trim()) return fields.personal.details.trim();
  const profile = fields.profile || {};
  if (profile.isPhoto === true) return '个人照片';
  const profileText = [profile.name, profile.headline, profile.email, profile.phone, profile.location, profile.website,
    profile.linkedin, profile.github, profile.summary].filter(Boolean).join('\n');
  if (profileText) return profileText;
  const recordText = [
    ...(fields.experiences || []).flatMap((record) => [[record.dates, record.role, record.organization, record.location].filter(Boolean).join(' · '), ...(record.bullets || [])]),
    ...(fields.projects || []).flatMap((record) => [[record.dates, record.name, record.role, record.url].filter(Boolean).join(' · '), ...(record.bullets || [])]),
    ...(fields.education || []).flatMap((record) => [[record.dates, record.degree, record.institution, record.location].filter(Boolean).join(' · '), ...(record.details || [])]),
    ...(fields.skills || []).map((record) => [record.category, ...(record.items || [])].filter(Boolean).join(' · ')),
  ].filter(Boolean).join('\n');
  return recordText || '暂无可复制的用户原文';
}

function isMaterialCardExpanded(itemId) {
  return intakeBankDensity === 'detailed' ? !collapsedMaterialIds.has(itemId) : expandedMaterialIds.has(itemId);
}

function applyMaterialCardExpansion(card, expanded) {
  const toggle = card.querySelector('.material-card-toggle');
  const details = card.querySelector('.material-card-details');
  const label = card.querySelector('.material-card-expansion-label');
  card.classList.toggle('expanded', expanded);
  card.classList.toggle('collapsed', !expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  details.hidden = false;
  details.setAttribute('aria-hidden', String(!expanded));
  details.inert = !expanded;
  label.textContent = expanded ? '收起' : '展开';
}

function toggleMaterialCard(itemId) {
  const expanded = !isMaterialCardExpanded(itemId);
  if (intakeBankDensity === 'detailed') {
    if (expanded) collapsedMaterialIds.delete(itemId);
    else collapsedMaterialIds.add(itemId);
  } else if (expanded) expandedMaterialIds.add(itemId);
  else expandedMaterialIds.delete(itemId);
  document.querySelectorAll('.material-card[data-material-id]').forEach((card) => {
    if (card.dataset.materialId === itemId) applyMaterialCardExpansion(card, expanded);
  });
}

function createMaterialCard(item, listKind) {
  const expanded = isMaterialCardExpanded(item.id);
  const selected = selectedMaterialIds.has(item.id);
  const category = item.kind === 'job' ? 'job' : materialPersonalCategory(item);
  const card = element('article', `material-card ${expanded ? 'expanded' : 'collapsed'} ${selected ? 'selected' : ''} kind-${item.kind} category-${category}`);
  card.setAttribute('role', 'listitem');
  card.dataset.materialId = item.id;
  const detailsId = `material-details-${listKind}-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'material-card-checkbox';
  checkbox.checked = selected;
  checkbox.setAttribute('aria-label', `选择 ${item.title || materialKindLabel(item)}`);
  checkbox.addEventListener('change', () => setMaterialSelected(item.id, checkbox.checked));
  const toggle = element('button', 'material-card-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', detailsId);
  const meta = element('div', 'material-card-meta');
  meta.append(element('span', 'material-kind', materialKindLabel(item)));
  const photoAsset = item.fields?.profile?.isPhoto === true
    ? (item.assets || []).find((asset) => /^image\/(?:png|jpeg)$/.test(asset.mimeType || ''))
    : null;
  if (photoAsset) {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'material-photo-thumbnail';
    thumbnail.src = photoAsset.url;
    thumbnail.alt = '个人照片缩略图';
    meta.prepend(thumbnail);
  }
  const lifecycle = element('div', 'material-card-lifecycle');
  const recorded = element('time', 'material-recorded-at', materialRecordedDate(item));
  recorded.dateTime = item.recordedAt || item.createdAt || '';
  recorded.title = `录入日期 ${materialRecordedDate(item)}`;
  recorded.setAttribute('aria-label', recorded.title);
  lifecycle.append(recorded);
  const title = element('strong', 'material-card-title', item.title || materialKindLabel(item));
  const expansionLabel = element('span', 'material-card-expansion-label', expanded ? '收起' : '展开');
  toggle.append(meta, title, lifecycle, expansionLabel);
  toggle.addEventListener('click', () => toggleMaterialCard(item.id));

  const details = element('div', 'material-card-details');
  details.id = detailsId;
  const detailsInner = element('div', 'material-card-details-inner');
  detailsInner.append(element('p', 'material-card-text', materialPlainText(item)));
  details.append(detailsInner);

  const remove = element('button', 'material-card-remove', '×');
  remove.type = 'button';
  remove.title = '从信息银行移除';
  remove.setAttribute('aria-label', `从信息银行移除 ${item.title}`);
  remove.addEventListener('click', async () => {
    if (!window.confirm(`从信息银行移除“${item.title}”？原始提交和附件仍保留在本机归档中。`)) return;
    try {
      const result = await request(`/api/intake/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      selectedMaterialIds.delete(item.id);
      expandedMaterialIds.delete(item.id);
      collapsedMaterialIds.delete(item.id);
      intakeBank = result.bank;
      renderMaterialBank();
    } catch (error) {
      showError('无法移除信息', error.message);
    }
  });
  card.append(checkbox, toggle, remove, details);
  applyMaterialCardExpansion(card, expanded);
  return card;
}

function selectMaterialBankDensity(density, persist = true) {
  intakeBankDensity = density === 'detailed' ? 'detailed' : 'compact';
  expandedMaterialIds = new Set();
  collapsedMaterialIds = new Set();
  if (persist) localStorage.setItem('cv-studio-material-bank-density', intakeBankDensity);
  renderMaterialBank();
}

function syncMaterialBankControls() {
  materialBankColumns.dataset.density = intakeBankDensity;
  materialBankPageSize.value = String(intakeBankPageSize);
  materialBankDensity.querySelectorAll('button[data-density]').forEach((button) => {
    const active = button.dataset.density === intakeBankDensity;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderMaterialBankPagination(kind, totalItems) {
  const pagination = materialBankPagination[kind];
  const totalPages = Math.max(1, Math.ceil(totalItems / intakeBankPageSize));
  intakeBankPages[kind] = Math.min(Math.max(1, intakeBankPages[kind] || 1), totalPages);
  const previous = pagination.querySelector('[data-page-action="previous"]');
  const next = pagination.querySelector('[data-page-action="next"]');
  previous.disabled = intakeBankPages[kind] <= 1;
  next.disabled = intakeBankPages[kind] >= totalPages;
  pagination.querySelector('span').textContent = `第 ${intakeBankPages[kind]} / ${totalPages} 页 · ${totalItems} 条`;
  pagination.hidden = totalPages <= 1;
}

function selectMaterialBankPage(kind, page) {
  if (!materialBankLists[kind]) return;
  intakeBankPages[kind] = Math.max(1, Number(page) || 1);
  renderMaterialBank();
}

function selectMaterialBankPageSize(value) {
  const nextSize = Number(value);
  intakeBankPageSize = [5, 10, 20, 50].includes(nextSize) ? nextSize : 10;
  intakeBankPages = { job: 1, personal: 1 };
  localStorage.setItem('cv-studio-material-bank-page-size', String(intakeBankPageSize));
  renderMaterialBank();
}

function updateMaterialBankFilters() {
  materialBankSearchQuery = materialBankSearch.value;
  materialBankCategoryFilter = materialBankCategory.value;
  intakeBankPages = { job: 1, personal: 1 };
  if (materialBankCategoryFilter === 'job') intakeBankKind = 'job';
  else if (materialBankCategoryFilter !== 'all') intakeBankKind = 'personal';
  else {
    const results = currentMaterialBankResults();
    const activeHasResults = results.some((item) => item.kind === intakeBankKind);
    const otherKind = intakeBankKind === 'job' ? 'personal' : 'job';
    if (!activeHasResults && results.some((item) => item.kind === otherKind)) intakeBankKind = otherKind;
  }
  renderMaterialBank();
}

function selectAllMaterialBankResults() {
  currentMaterialBankResults().forEach((item) => selectedMaterialIds.add(item.id));
  renderMaterialBank();
}

function invertMaterialBankResults() {
  currentMaterialBankResults().forEach((item) => {
    if (selectedMaterialIds.has(item.id)) selectedMaterialIds.delete(item.id);
    else selectedMaterialIds.add(item.id);
  });
  renderMaterialBank();
}

function clearMaterialBankSelection() {
  selectedMaterialIds.clear();
  renderMaterialBank();
}

async function deleteSelectedMaterialBankItems() {
  const itemIds = [...selectedMaterialIds];
  if (!itemIds.length) return;
  if (!window.confirm(`确定批量删除已选的 ${itemIds.length} 条信息吗？原始提交和附件仍保留在本机归档中。`)) return;
  materialBankDeleteSelected.disabled = true;
  try {
    const result = await request('/api/intake/items/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    });
    itemIds.forEach((itemId) => {
      selectedMaterialIds.delete(itemId);
      expandedMaterialIds.delete(itemId);
      collapsedMaterialIds.delete(itemId);
    });
    intakeBank = result.bank;
    renderMaterialBank();
  } catch (error) {
    syncMaterialBankSelectionControls();
    const details = error.status === 404 && !error.responseWasJson
      ? '当前页面已经更新，但后台仍是旧版本。请完全退出并重新启动 CV Studio，再执行批量删除；本次请求没有删除任何信息。'
      : error.message;
    showError('无法批量删除信息', details);
  }
}

function activateMaterialBankColumn(kind, shouldAnimate = true) {
  if (!materialBankLists[kind]) return;
  const columns = [...materialBankColumns.querySelectorAll('.material-bank-column')];
  const nextColumn = columns.find((column) => column.dataset.kind === kind);
  if (!nextColumn) return;
  const previousColumn = columns.find((column) => column.classList.contains('active'));
  const canStretch = shouldAnimate
    && !reduceMotion.matches
    && previousColumn !== nextColumn
    && window.getComputedStyle(materialBankColumns).flexDirection === 'row';
  const firstRects = canStretch
    ? new Map(columns.map((column) => [column, column.getBoundingClientRect()]))
    : null;

  materialBankTransitionToken += 1;
  materialBankColumnAnimations.forEach((playback) => playback.stop());
  materialBankColumnAnimations = [];
  columns.forEach((column) => column.style.removeProperty('transform'));
  materialBankColumns.classList.toggle('is-stretching', canStretch);

  intakeBankKind = kind;
  materialBankColumns.dataset.activeKind = kind;
  columns.forEach((column) => {
    const active = column.dataset.kind === kind;
    const header = column.querySelector('.material-bank-column-header');
    const content = column.querySelector('.material-bank-column-content');
    column.classList.toggle('active', active);
    header.setAttribute('aria-expanded', String(active));
    content.hidden = !active;
    content.setAttribute('aria-hidden', String(!active));
    content.inert = !active;
    if (active && shouldAnimate && !canStretch) animateElement(content, { opacity: [.25, 1] }, { duration: .26 });
  });

  if (!canStretch) return;
  const transitionToken = materialBankTransitionToken;
  const lastRects = new Map(columns.map((column) => [column, column.getBoundingClientRect()]));
  const playbacks = columns.map((column) => {
    const first = firstRects.get(column);
    const last = lastRects.get(column);
    const firstCenter = first.left + first.width / 2;
    const lastCenter = last.left + last.width / 2;
    const deltaX = firstCenter - lastCenter;
    const initialScaleX = first.width / last.width;
    return animate(column, {
      x: [deltaX, 0],
      scaleX: [initialScaleX, 1],
    }, {
      duration: .52,
      ease: [.22, 1, .36, 1],
    });
  });
  materialBankColumnAnimations = playbacks;
  Promise.all(playbacks.map((playback) => playback.then(() => true, () => false))).then(() => {
    if (transitionToken !== materialBankTransitionToken) return;
    columns.forEach((column) => column.style.removeProperty('transform'));
    materialBankColumnAnimations = [];
    materialBankColumns.classList.remove('is-stretching');
  });
}

function renderMaterialBank() {
  const items = Array.isArray(intakeBank.items) ? intakeBank.items : [];
  syncMaterialBankSelectionControls();
  const sorted = currentMaterialBankResults();
  const filtering = Boolean(materialBankSearchQuery.trim()) || materialBankCategoryFilter !== 'all';
  const totalCounts = {
    job: items.filter((item) => item.kind === 'job').length,
    personal: items.filter((item) => item.kind === 'personal').length,
  };
  const resultCounts = {
    job: sorted.filter((item) => item.kind === 'job').length,
    personal: sorted.filter((item) => item.kind === 'personal').length,
  };
  document.querySelector('#bank-count-job').textContent = filtering ? `${resultCounts.job}/${totalCounts.job}` : String(totalCounts.job);
  document.querySelector('#bank-count-personal').textContent = filtering ? `${resultCounts.personal}/${totalCounts.personal}` : String(totalCounts.personal);
  document.querySelector('#intake-sidebar-count').textContent = `${items.length} 条已入库信息`;
  syncMaterialBankControls();
  Object.entries(materialBankLists).forEach(([kind, list]) => {
    list.replaceChildren();
    const visible = sorted.filter((item) => item.kind === kind);
    renderMaterialBankPagination(kind, visible.length);
    if (!visible.length) {
      const message = filtering
        ? `没有符合当前搜索或类别筛选的${kind === 'job' ? '职位描述' : '个人信息'}。`
        : kind === 'job' ? '还没有职位描述。' : '还没有个人信息。请录入简历或个人材料进行解析。';
      list.append(element('p', 'material-bank-empty', message));
      return;
    }
    const start = (intakeBankPages[kind] - 1) * intakeBankPageSize;
    visible.slice(start, start + intakeBankPageSize).forEach((item) => list.append(createMaterialCard(item, kind)));
  });
  activateMaterialBankColumn(intakeBankKind, false);
}

async function loadIntakeBank() {
  try {
    intakeBank = await request('/api/intake/bank');
    renderMaterialBank();
  } catch (error) {
    showError('无法读取素材银行', error.message);
  }
}

const CV_FIT_DESCRIPTIONS = {
  strict: '全篇围绕已选职位组织；Agent 会优先复用职位语言并突出最匹配的事实，但不会把职位要求冒充成你的经历。',
  focused: '明显强调匹配经历、成果和技能，同时保留少量完整职业背景。',
  balanced: '兼顾职位相关性与完整履历，适合作为大多数定向投递的起点。',
  light: '职位只影响内容顺序和少量措辞，整体仍保持通用表达。',
  none: '职位描述不会发送给生成 Agent，也不会参与标题、排序或措辞。',
};

function updateIntakeGenerateFitDescription() {
  const description = document.querySelector('#intake-generate-fit-description');
  description.textContent = intakeGenerateFit.disabled
    ? '本次没有选择职位描述，将生成完全不考虑职位的通用 CV。'
    : CV_FIT_DESCRIPTIONS[intakeGenerateFit.value] || CV_FIT_DESCRIPTIONS.balanced;
}

function setIntakeGenerationBusy(isBusy) {
  intakeGenerationActive = isBusy;
  intakeGenerateForm.setAttribute('aria-busy', String(isBusy));
  intakeGenerateSetup.hidden = isBusy;
  intakeGenerateProgress.hidden = !isBusy;
  const submit = document.querySelector('#intake-generate-submit');
  const cancel = document.querySelector('#intake-generate-cancel');
  submit.disabled = isBusy;
  cancel.disabled = false;
  cancel.textContent = isBusy ? '停止生成' : '取消';
  submit.textContent = isBusy ? 'CV Agent 生成中…' : '创建新 CV 并打开';
}

function updateIntakeGenerationProgress(event = {}) {
  const percent = Math.max(0, Math.min(100, Number(event.percent) || 0));
  const progressbar = document.querySelector('#intake-generate-progressbar');
  progressbar.setAttribute('aria-valuenow', String(percent));
  progressbar.querySelector('span').style.width = `${percent}%`;
  document.querySelector('#intake-generate-progress-percent').textContent = `${percent}%`;
  document.querySelector('#intake-generate-progress-message').textContent = event.message || 'CV Agent 正在生成…';
  const phaseLabels = {
    validate: '核对选择', prepare: '整理素材', local: '本地生成', agent: 'CV Agent', compile: '编译验证', save: '保存项目', complete: '生成完成',
  };
  document.querySelector('#intake-generate-progress-step').textContent = event.step && event.maxSteps
    ? `${phaseLabels[event.phase] || 'Agent'} · ${event.step} / ${event.maxSteps}`
    : phaseLabels[event.phase] || '准备生成';
}

async function requestGenerationStream(payload, onProgress, signal) {
  const response = await fetch('/api/intake/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const rawBody = await response.text();
    let message = rawBody.trim() || 'CV generation failed.';
    try { message = JSON.parse(rawBody).error || message; } catch { /* Keep the plain-text server response. */ }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalState = null;

  function consumeLine(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('生成进度返回了无效数据，请重试。'); }
    if (event.type === 'progress') onProgress(event);
    else if (event.type === 'complete') finalState = event.state;
    else if (event.type === 'error') throw new Error(event.error || 'CV generation failed.');
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  if (!finalState) throw new Error('生成已结束，但没有返回新的 CV 项目。');
  return finalState;
}

function openIntakeGenerateDialog() {
  const selectedItems = (intakeBank.items || []).filter((item) => selectedMaterialIds.has(item.id));
  const personalItems = selectedItems.filter((item) => item.kind === 'personal');
  const jobs = selectedItems.filter((item) => item.kind === 'job');
  if (!personalItems.length) {
    showError('请先选择 CV 内容', '请在信息银行中至少勾选一条个人信息、工作经历或项目经历。');
    return;
  }
  intakeGenerationItemIds = selectedItems.map((item) => item.id);
  document.querySelector('#intake-generate-summary-count').textContent = `${personalItems.length} 条个人信息 · ${jobs.length} 个职位`;
  document.querySelector('#intake-generate-summary-items').replaceChildren(...selectedItems.map((item) => {
    const label = item.kind === 'job'
      ? `职位 · ${item.fields?.job?.title || item.title}`
      : `${materialKindLabel(item)} · ${item.title}`;
    return element('li', item.kind === 'job' ? 'job' : '', label);
  }));
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const version = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  document.querySelector('#intake-generate-name').value = `generated-cv-${version}`;
  const rememberedFit = localStorage.getItem('cv-studio-generation-fit');
  intakeGenerateFit.disabled = !jobs.length;
  intakeGenerateFit.value = jobs.length && Object.hasOwn(CV_FIT_DESCRIPTIONS, rememberedFit) ? rememberedFit : jobs.length ? 'balanced' : 'none';
  const templateInputs = [...intakeGenerateTemplates.querySelectorAll('input[name="cv-template"]')];
  const rememberedTemplate = localStorage.getItem('cv-studio-generation-template');
  const selectedTemplate = templateInputs.find((input) => input.value === rememberedTemplate) || templateInputs[0];
  if (selectedTemplate) selectedTemplate.checked = true;
  updateIntakeGenerateFitDescription();
  const errorNode = document.querySelector('#intake-generate-error');
  errorNode.hidden = true;
  errorNode.textContent = '';
  updateIntakeGenerationProgress({ phase: 'validate', percent: 0, message: '正在核对已选信息…' });
  setIntakeGenerationBusy(false);
  intakeGenerateDialog.showModal();
  window.setTimeout(() => document.querySelector('#intake-generate-name').select(), 60);
}

async function generateCvFromIntake(event) {
  event.preventDefault();
  if (intakeGenerationActive) return;
  const selectedItems = (intakeBank.items || []).filter((item) => intakeGenerationItemIds.includes(item.id));
  if (!selectedItems.some((item) => item.kind === 'personal')) {
    showError('请选择素材', '至少选择一条个人信息、工作经历或项目经历。');
    return;
  }
  if (!await prepareProjectSwitch()) return;
  const errorNode = document.querySelector('#intake-generate-error');
  errorNode.hidden = true;
  errorNode.textContent = '';
  const fitLevel = selectedItems.some((item) => item.kind === 'job') ? intakeGenerateFit.value : 'none';
  const templateId = intakeGenerateTemplates.querySelector('input[name="cv-template"]:checked')?.value || 'classic';
  localStorage.setItem('cv-studio-generation-fit', fitLevel);
  localStorage.setItem('cv-studio-generation-template', templateId);
  setIntakeGenerationBusy(true);
  intakeGenerationAbortController = new AbortController();
  updateIntakeGenerationProgress({ phase: 'validate', percent: 2, message: '正在启动 CV 生成流程…' });
  try {
    const state = await requestGenerationStream({
      name: document.querySelector('#intake-generate-name').value.trim(),
      fitLevel,
      templateId,
      itemIds: [...intakeGenerationItemIds],
      provider: agentSettings(),
    }, updateIntakeGenerationProgress, intakeGenerationAbortController.signal);
    applyProjectState(state);
    intakeGenerateDialog.close();
    await switchView('editor-view');
  } catch (error) {
    setIntakeGenerationBusy(false);
    errorNode.textContent = error.name === 'AbortError' ? '已停止生成。你可以调整名称或职位贴合率后重试。' : error.message;
    errorNode.hidden = false;
    document.querySelector('#intake-generate-name').focus();
  } finally {
    intakeGenerationAbortController = null;
    if (!intakeGenerateDialog.open) setIntakeGenerationBusy(false);
  }
}

function renderEntryOptions(entries = []) {
  const candidates = entries.length ? entries : projectEntries.filter((file) => file.editable && file.path.endsWith('.tex')).map((file) => file.path);
  entryFileSelect.replaceChildren(...candidates.map((filePath) => {
    const option = document.createElement('option');
    option.value = filePath;
    option.textContent = filePath;
    option.selected = filePath === entryFile;
    return option;
  }));
}

function applyProjectState(state) {
  projectEntries = Array.isArray(state.files) ? state.files : [];
  collapsedDirectories = new Set();
  const topLevelDirectories = new Set(projectEntries.filter((file) => file.path.includes('/')).map((file) => file.path.split('/')[0]));
  topLevelDirectories.forEach((directory) => {
    const descendants = projectEntries.filter((file) => file.path.startsWith(`${directory}/`));
    if (descendants.length && descendants.every((file) => !file.editable)) collapsedDirectories.add(directory);
  });
  projectFiles = new Map(projectEntries.filter((file) => file.editable && typeof file.source === 'string').map((file) => [file.path, file.source]));
  savedSources = new Map(projectFiles);
  entryFile = state.entry || projectFiles.keys().next().value || 'resume.tex';
  activeFile = projectFiles.has(entryFile) ? entryFile : projectFiles.keys().next().value || entryFile;
  setEditorValue(projectFiles.get(activeFile) || '');
  activeFileLabel.textContent = activeFile;
  projectName.textContent = state.name || 'workspace';
  projectName.title = state.root || state.name || '当前项目';
  rememberCvProject(state);
  loadAgentConversation();
  renderEntryOptions(state.entries || []);
  renderFileList();
  compilerLabel.textContent = state.compilerName || '未检测到编译器';
  document.querySelector('#engine-label').textContent = state.compilerAvailable ? state.compilerName : '未检测到编译器';
  preview.hidden = true;
  previewEmpty.hidden = false;
  updateEditorState();
}

async function openProjectFolder(pathValue, preferredEntry = '') {
  const state = await request('/api/project/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: pathValue, entry: preferredEntry }),
  });
  applyProjectState(state);
  const dialog = document.querySelector('#open-folder-dialog');
  if (dialog.open) dialog.close();
}

async function chooseAndOpenProjectFolder() {
  if (currentProjectRoot && !await prepareProjectSwitch()) return;
  if (window.cvStudioDesktop?.selectProjectFolder) {
    const selectedPath = await window.cvStudioDesktop.selectProjectFolder();
    if (selectedPath) await openProjectFolder(selectedPath);
    return;
  }
  const dialog = document.querySelector('#open-folder-dialog');
  document.querySelector('#project-folder-path').value = currentProjectRoot || '';
  dialog.showModal();
  window.setTimeout(() => document.querySelector('#project-folder-path').focus(), 80);
}

async function changeEntryFile() {
  const nextEntry = entryFileSelect.value;
  if (!nextEntry || nextEntry === entryFile) return;
  await request('/api/project/entry', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: nextEntry }),
  });
  entryFile = nextEntry;
  selectProjectFile(nextEntry);
  updateCurrentCvLibraryEntry();
  preview.hidden = true;
  previewEmpty.hidden = false;
}

function setZenMode(enabled) {
  const update = () => {
    appView.classList.toggle('zen-mode', enabled);
    document.querySelector('#zen-button').setAttribute('aria-pressed', String(enabled));
    localStorage.setItem('cv-studio-zen-mode', String(enabled));
    requestAnimationFrame(() => editorView?.requestMeasure());
  };
  if (document.startViewTransition) document.startViewTransition(update);
  else update();
}

function toggleZenMode() {
  setZenMode(!appView.classList.contains('zen-mode'));
}

async function switchView(viewId) {
  const previousViewId = activeView;
  const token = ++viewTransitionToken;
  const nextView = document.querySelector(`#${viewId}`);
  const currentView = previousViewId === 'landing-view' ? null : document.querySelector(`#${previousViewId}`);

  if (previousViewId === 'landing-view' && !landingView.hidden) {
    const transition = animateElement(landingView, { opacity: [1, 0], scale: [1, .992] }, { duration: .18 });
    if (transition) await transition;
    if (token !== viewTransitionToken) return;
  }
  landingView.hidden = true;
  appView.hidden = false;
  activeView = viewId;
  sidebarItems.forEach((item) => item.classList.toggle('active', item.dataset.view === viewId));
  const inEditor = viewId === 'editor-view';
  editorActions.forEach((action) => { action.hidden = !inEditor; });
  saveStatus.hidden = !inEditor;
  const [kicker, title, description] = viewMeta[viewId];
  viewKicker.textContent = kicker;
  viewTitle.textContent = title;
  viewDescription.textContent = description;

  const revealNextView = () => {
    if (token !== viewTransitionToken) return;
    views.forEach((view) => {
      const active = view.id === viewId;
      view.hidden = !active;
      view.classList.toggle('active-view', active);
      view.classList.remove('view-exit');
    });
    requestAnimationFrame(() => {
      // Avoid transforming the whole view: transformed ancestors change the
      // containing block for the floating Agent and can push it off-screen.
      animateElement(nextView, { opacity: [0, 1] }, { duration: .28 });
      animateElement(document.querySelector('.app-topbar'), { opacity: [.4, 1], y: [-6, 0] }, { duration: .32 });
    });
  };

  if (currentView && currentView !== nextView && !currentView.hidden) {
    const transition = animateElement(currentView, { opacity: [1, 0], x: [0, -8] }, { duration: .14 });
    if (transition) await transition;
    revealNextView();
  } else {
    revealNextView();
  }
}

async function returnHome() {
  viewTransitionToken += 1;
  const transition = animateElement(appView, { opacity: [1, 0], scale: [1, .994] }, { duration: .18 });
  if (transition) await transition;
  activeView = 'landing-view';
  appView.hidden = true;
  landingView.hidden = false;
  appView.style.opacity = '';
  animateLanding();
}

function setSidebarCollapsed(collapsed) {
  appView.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? '展开侧栏' : '折叠侧栏');
  sidebarToggle.title = collapsed ? '展开侧栏' : '折叠侧栏';
  sidebarToggle.textContent = collapsed ? '›' : '‹';
  localStorage.setItem('cv-studio-sidebar-collapsed', String(collapsed));
  animateElement(document.querySelector('.sidebar'), { opacity: [.72, 1] }, { duration: .24 });
}

function toggleSidebar() {
  setSidebarCollapsed(!appView.classList.contains('sidebar-collapsed'));
}

function setTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = nextTheme;
  if (editorView) editorView.dispatch({ effects: editorTheme.reconfigure(nextTheme === 'dark' ? oneDark : lightEditorTheme) });
  localStorage.setItem('cv-studio-theme', nextTheme);
  themeLabel.textContent = nextTheme === 'dark' ? '深色模式' : '浅色模式';
  document.querySelector('#theme-toggle').setAttribute('aria-label', nextTheme === 'dark' ? '切换浅色模式' : '切换深色模式');
  document.querySelector('#landing-theme-toggle').setAttribute('aria-label', nextTheme === 'dark' ? '切换浅色模式' : '切换深色模式');
}

function toggleTheme() {
  const update = () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(update);
  else update();
}

async function save() {
  saveButton.disabled = true;
  syncActiveFile();
  try {
    const dirtyFiles = [...projectFiles.entries()].filter(([filePath, source]) => source !== savedSources.get(filePath));
    await Promise.all(dirtyFiles.map(([filePath, source]) => request('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, source }),
    })));
    projectFiles.forEach((source, filePath) => savedSources.set(filePath, source));
    updateEditorState();
    return true;
  } catch (error) {
    showError(error.message, error.details);
    return false;
  } finally {
    saveButton.disabled = false;
  }
}

function updatePdfControls() {
  const pageCount = pdfDocument?.numPages || 1;
  pdfPageNumber.value = String(pdfPage);
  pdfPageNumber.max = String(pageCount);
  pdfPageCount.textContent = String(pageCount);
  document.querySelector('#pdf-previous-page').disabled = !pdfDocument || pdfPage <= 1;
  document.querySelector('#pdf-next-page').disabled = !pdfDocument || pdfPage >= pageCount;
  pdfFitMode.value = pdfMode;
  pdfZoomLabel.textContent = pdfMode === 'width'
    ? '适宽'
    : pdfMode === 'page'
      ? '整页'
      : `${Math.round(pdfScale * 100)}%`;
}

function extractPdfTextItems(textContent, viewport) {
  return (textContent?.items || []).flatMap((item) => {
    if (!item?.str || !Array.isArray(item.transform)) return [];
    const transform = Util.transform(viewport.transform, item.transform);
    const height = Math.max(4, Math.hypot(transform[2], transform[3]) || Number(item.height) * pdfScale || 8);
    const width = Math.max(2, Number(item.width) * pdfScale || height);
    return [{
      text: item.str,
      x: Math.max(0, transform[4] / viewport.width),
      y: Math.max(0, (transform[5] - height) / viewport.height),
      width: Math.min(1, width / viewport.width),
      height: Math.min(1, height / viewport.height),
    }];
  });
}

function drawAnnotationPath(context, annotation, width, height, options = {}) {
  if (!annotation?.points?.length) return;
  context.beginPath();
  annotation.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (annotation.points.length > 2) context.closePath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = options.lineWidth || 3;
  context.strokeStyle = options.stroke || '#d55b32';
  context.fillStyle = options.fill || 'rgb(213 91 50 / 10%)';
  if (annotation.points.length > 2) context.fill();
  context.stroke();
}

function renderPdfAnnotations() {
  const rect = pdfCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  pdfAnnotationCanvas.width = Math.round(rect.width * outputScale);
  pdfAnnotationCanvas.height = Math.round(rect.height * outputScale);
  pdfAnnotationCanvas.style.width = `${rect.width}px`;
  pdfAnnotationCanvas.style.height = `${rect.height}px`;
  const context = pdfAnnotationCanvas.getContext('2d');
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  if (pdfInlineSelection) {
    drawAnnotationPath(context, pdfInlineSelection, rect.width, rect.height, {
      lineWidth: 2,
      stroke: '#b94b29',
      fill: 'rgb(213 91 50 / 14%)',
    });
  }
  const activeId = activeVisualContext?.annotationId;
  pdfAnnotations
    .filter((annotation) => annotation.page === pdfPage)
    .forEach((annotation) => drawAnnotationPath(context, annotation, rect.width, rect.height, {
      lineWidth: annotation.id === activeId ? 4 : 3,
      fill: annotation.id === activeId ? 'rgb(213 91 50 / 16%)' : 'rgb(213 91 50 / 9%)',
    }));
  if (pdfAnnotationDraft) drawAnnotationPath(context, pdfAnnotationDraft, rect.width, rect.height, { lineWidth: 3 });
  renderPdfAnnotationHits();
}

function renderPdfAnnotationHits() {
  pdfAnnotationHits.replaceChildren();
  if (pdfInlineEditActive) {
    pdfTextItems.forEach((item, index) => {
      if (!item.text.trim()) return;
      const button = element('button', 'pdf-text-hit');
      button.type = 'button';
      button.style.left = `${item.x * 100}%`;
      button.style.top = `${item.y * 100}%`;
      button.style.width = `${Math.max(item.width, .008) * 100}%`;
      button.style.height = `${Math.max(item.height, .012) * 100}%`;
      button.setAttribute('aria-label', `编辑 PDF 文字：${item.text.trim().slice(0, 80)}`);
      button.title = '直接修改这段文字';
      button.addEventListener('click', () => openPdfInlineEditor(index));
      pdfAnnotationHits.append(button);
    });
    return;
  }
  pdfAnnotations.filter((annotation) => annotation.page === pdfPage).forEach((annotation, index) => {
    const button = element('button', 'pdf-annotation-hit');
    button.type = 'button';
    button.style.left = `${annotation.bounds.x * 100}%`;
    button.style.top = `${annotation.bounds.y * 100}%`;
    button.style.width = `${annotation.bounds.width * 100}%`;
    button.style.height = `${annotation.bounds.height * 100}%`;
    button.setAttribute('aria-label', `打开第 ${pdfPage} 页圈选区域 ${index + 1} 的 Agent`);
    button.title = '点按后用 Agent 修改这里';
    button.classList.toggle('active', annotation.id === activeVisualContext?.annotationId);
    button.append(element('span', '', String(index + 1)));
    button.addEventListener('click', () => activatePdfAnnotation(annotation));
    pdfAnnotationHits.append(button);
  });
}

function setPdfAnnotationDrawing(active) {
  if (active && pdfInlineEditActive) {
    pdfInlineEditActive = false;
    document.body.classList.remove('pdf-inline-edit-mode');
    closePdfInlineEditor({ clearContext: true });
  }
  pdfAnnotationDrawing = Boolean(active && pdfReviewActive && pdfDocument);
  pdfPageShell.classList.toggle('is-drawing', pdfAnnotationDrawing);
  const button = document.querySelector('#pdf-draw-region');
  button.setAttribute('aria-pressed', String(pdfAnnotationDrawing));
  button.classList.toggle('active', pdfAnnotationDrawing);
  document.querySelector('#pdf-review-guide').textContent = pdfAnnotationDrawing
    ? '在页面上拖动画圈。松开后，点击圈选区域即可向 Agent 描述你想改什么。'
    : '点击圈选区域进入 Agent，或再次点击“圈选”添加一个区域。';
}

function clearActiveVisualContext() {
  activeVisualContext = null;
  agentVisualContext.hidden = true;
  agentContextThumbnail.removeAttribute('src');
  renderPdfAnnotations();
}

function closePdfInlineEditor({ clearContext = false } = {}) {
  pdfInlineEditor.hidden = true;
  pdfInlineSelection = null;
  pdfInlineReplacement.value = '';
  if (clearContext) clearActiveVisualContext();
  else renderPdfAnnotations();
}

function inlineAnnotation(selection) {
  const { x, y, width, height } = selection.bounds;
  return {
    page: pdfPage,
    bounds: selection.bounds,
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ],
  };
}

function openPdfInlineEditor(itemIndex) {
  const selection = textLineForPdfItem(pdfTextItems, itemIndex);
  if (!selection) return;
  const annotation = inlineAnnotation(selection);
  pdfInlineSelection = { ...annotation, originalText: selection.text };
  const imageDataUrl = createPdfRegionImage(annotation);
  activeVisualContext = {
    annotationId: null,
    page: pdfPage,
    bounds: selection.bounds,
    label: 'PDF inline text selection',
    selectedText: selection.text,
    imageDataUrl,
  };
  agentContextThumbnail.src = imageDataUrl;
  document.querySelector('#agent-context-label').textContent = `PDF 第 ${pdfPage} 页 · 原位编辑`;
  document.querySelector('#agent-context-text').textContent = `已定位文字：${selection.text.slice(0, 80)}${selection.text.length > 80 ? '…' : ''}`;
  agentVisualContext.hidden = false;
  const shellWidth = pdfPageShell.clientWidth;
  const shellHeight = pdfPageShell.clientHeight;
  const editorWidth = Math.min(360, Math.max(260, shellWidth - 24));
  const left = Math.min(Math.max(12, selection.bounds.x * shellWidth), Math.max(12, shellWidth - editorWidth - 12));
  const preferredTop = (selection.bounds.y + selection.bounds.height) * shellHeight + 10;
  const top = Math.min(Math.max(12, preferredTop), Math.max(12, shellHeight - 190));
  pdfInlineEditor.style.left = `${left}px`;
  pdfInlineEditor.style.top = `${top}px`;
  pdfInlineEditor.style.width = `${editorWidth}px`;
  pdfInlineEditor.hidden = false;
  pdfInlineReplacement.value = selection.text;
  renderPdfAnnotations();
  pdfInlineReplacement.focus();
  pdfInlineReplacement.select();
}

function submitPdfInlineEdit(event) {
  event.preventDefault();
  if (!pdfInlineSelection || !activeVisualContext) return;
  if (agentSettings().type === 'local') {
    showError('PDF 原位编辑需要模型 Agent', '请先在 AI Provider 中配置 OpenAI、Anthropic 或 Hermes。文字与局部图像只会在你提交这次编辑后发送。');
    return;
  }
  const original = pdfInlineSelection.originalText;
  const replacement = pdfInlineReplacement.value.trim();
  if (replacement === original.trim()) {
    closePdfInlineEditor();
    return;
  }
  const message = [
    '执行一次 PDF 原位编辑。请先用圈选文字和图像定位生成这段内容的真实 LaTeX 源码。',
    `PDF 页码：${pdfPage}`,
    `当前渲染文字：${JSON.stringify(original)}`,
    `用户希望显示为：${JSON.stringify(replacement)}`,
    '只修改产生这段渲染文字的必要源码，保留模板宏、列结构和其余内容；不要用 PDF 文字猜测文件路径。完成提案后必须临时编译验证。',
  ].join('\n');
  closePdfInlineEditor();
  setAgentWindowState({ mode: 'floating', open: true });
  agentInput.value = message;
  document.querySelector('#agent-form').requestSubmit();
}

function resetPdfAnnotations() {
  pdfAnnotations = [];
  pdfAnnotationDraft = null;
  nextAnnotationId = 1;
  pdfInlineSelection = null;
  pdfInlineEditor.hidden = true;
  clearActiveVisualContext();
}

function createPdfRegionImage(annotation) {
  const sourceWidth = pdfCanvas.width;
  const sourceHeight = pdfCanvas.height;
  const padding = annotation.fullPage ? 0 : .035;
  const crop = {
    x: Math.max(0, annotation.bounds.x - padding),
    y: Math.max(0, annotation.bounds.y - padding),
    width: Math.min(1, annotation.bounds.x + annotation.bounds.width + padding) - Math.max(0, annotation.bounds.x - padding),
    height: Math.min(1, annotation.bounds.y + annotation.bounds.height + padding) - Math.max(0, annotation.bounds.y - padding),
  };
  const cropWidth = Math.max(1, Math.round(crop.width * sourceWidth));
  const cropHeight = Math.max(1, Math.round(crop.height * sourceHeight));
  const scale = Math.min(1, 1_100 / Math.max(cropWidth, cropHeight));
  const target = document.createElement('canvas');
  target.width = Math.max(1, Math.round(cropWidth * scale));
  target.height = Math.max(1, Math.round(cropHeight * scale));
  const context = target.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(
    pdfCanvas,
    Math.round(crop.x * sourceWidth), Math.round(crop.y * sourceHeight), cropWidth, cropHeight,
    0, 0, target.width, target.height,
  );
  if (!annotation.fullPage) {
    const cropPath = {
      points: annotation.points.map((point) => ({
        x: (point.x - crop.x) / crop.width,
        y: (point.y - crop.y) / crop.height,
      })),
    };
    drawAnnotationPath(context, cropPath, target.width, target.height, {
      lineWidth: Math.max(3, target.width / 260),
      fill: 'rgb(213 91 50 / 8%)',
    });
  }
  return target.toDataURL('image/jpeg', .86);
}

async function activatePdfAnnotation(annotation) {
  if (!annotation || annotation.page !== pdfPage) return;
  const selectedText = textForPdfRegion(pdfTextItems, annotation.bounds);
  const imageDataUrl = createPdfRegionImage(annotation);
  activeVisualContext = {
    annotationId: annotation.id,
    page: annotation.page,
    bounds: annotation.bounds,
    label: annotation.fullPage ? 'full rendered page' : `highlighted region ${annotation.id}`,
    selectedText,
    imageDataUrl,
  };
  agentContextThumbnail.src = imageDataUrl;
  document.querySelector('#agent-context-label').textContent = annotation.fullPage
    ? `PDF 第 ${annotation.page} 页 · 整页`
    : `PDF 第 ${annotation.page} 页 · 区域 ${annotation.id}`;
  document.querySelector('#agent-context-text').textContent = selectedText
    ? `已定位文字：${selectedText.slice(0, 80)}${selectedText.length > 80 ? '…' : ''}`
    : '未提取到文字；将使用视觉图像定位';
  agentVisualContext.hidden = false;
  setPdfAnnotationDrawing(false);
  setAgentWindowState({ mode: 'floating', open: true });
  renderPdfAnnotations();
  agentInput.focus();
}

function useCurrentPdfPage() {
  if (!pdfDocument) return;
  const annotation = {
    id: nextAnnotationId++,
    page: pdfPage,
    fullPage: true,
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }],
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  };
  pdfAnnotations.push(annotation);
  activatePdfAnnotation(annotation);
}

function enterPdfReviewMode(mode = 'annotate') {
  if (!pdfDocument || pdfReviewActive) return;
  pdfReviewActive = true;
  pdfInlineEditActive = mode === 'inline';
  pdfModeBeforeReview = pdfMode;
  document.body.classList.add('pdf-review-mode');
  document.body.classList.toggle('pdf-inline-edit-mode', pdfInlineEditActive);
  previewPane.classList.add('pdf-review-active');
  document.documentElement.requestFullscreen?.().catch(() => {});
  pdfMode = 'page';
  setPdfAnnotationDrawing(!pdfInlineEditActive);
  if (pdfInlineEditActive) {
    document.querySelector('#pdf-review-guide').textContent = '点选 PDF 中的文字，直接改写后同步到真实 LaTeX 源码。';
  }
  window.setTimeout(renderPdfPage, 80);
}

function exitPdfReviewMode(exitFullscreen = true) {
  if (!pdfReviewActive) return;
  pdfReviewActive = false;
  pdfInlineEditActive = false;
  setPdfAnnotationDrawing(false);
  document.body.classList.remove('pdf-review-mode');
  document.body.classList.remove('pdf-inline-edit-mode');
  previewPane.classList.remove('pdf-review-active');
  closePdfInlineEditor({ clearContext: true });
  pdfMode = pdfModeBeforeReview;
  if (exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  window.setTimeout(renderPdfPage, 80);
}

function annotationPoint(event) {
  const rect = pdfAnnotationCanvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function startPdfAnnotation(event) {
  if (!pdfAnnotationDrawing || event.button !== 0) return;
  event.preventDefault();
  pdfAnnotationCanvas.setPointerCapture(event.pointerId);
  pdfAnnotationDraft = { points: [annotationPoint(event)] };
  renderPdfAnnotations();
}

function continuePdfAnnotation(event) {
  if (!pdfAnnotationDraft || !pdfAnnotationCanvas.hasPointerCapture(event.pointerId)) return;
  const point = annotationPoint(event);
  const previous = pdfAnnotationDraft.points.at(-1);
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < .0025) return;
  pdfAnnotationDraft.points.push(point);
  renderPdfAnnotations();
}

function finishPdfAnnotation(event) {
  if (!pdfAnnotationDraft) return;
  if (pdfAnnotationCanvas.hasPointerCapture(event.pointerId)) pdfAnnotationCanvas.releasePointerCapture(event.pointerId);
  const points = pdfAnnotationDraft.points;
  pdfAnnotationDraft = null;
  if (points.length < 2) {
    renderPdfAnnotations();
    return;
  }
  const annotation = { id: nextAnnotationId++, page: pdfPage, points, bounds: boundsForPoints(points) };
  pdfAnnotations.push(annotation);
  setPdfAnnotationDrawing(false);
  renderPdfAnnotations();
  document.querySelector('#pdf-review-guide').textContent = `区域 ${annotation.id} 已保存。点击橙色圈选区域，告诉 Agent 你想怎么改。`;
}

async function renderPdfPage() {
  if (!pdfDocument) return;
  const renderVersion = ++pdfRenderVersion;
  pdfLoading.hidden = false;
  pdfRenderTask?.cancel();
  try {
    const page = await pdfDocument.getPage(pdfPage);
    if (renderVersion !== pdfRenderVersion) return;
    const naturalViewport = page.getViewport({ scale: 1, rotation: pdfRotation });
    const stageWidth = Math.max(220, pdfStage.clientWidth - 48);
    const stageHeight = Math.max(220, pdfStage.clientHeight - 48);
    if (pdfMode === 'width') pdfScale = stageWidth / naturalViewport.width;
    else if (pdfMode === 'page') pdfScale = Math.min(stageWidth / naturalViewport.width, stageHeight / naturalViewport.height);
    else if (pdfMode === 'actual') pdfScale = 1;
    pdfScale = Math.min(3, Math.max(.35, pdfScale));

    const viewport = page.getViewport({ scale: pdfScale, rotation: pdfRotation });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = pdfCanvas.getContext('2d', { alpha: false });
    pdfCanvas.width = Math.floor(viewport.width * outputScale);
    pdfCanvas.height = Math.floor(viewport.height * outputScale);
    pdfCanvas.style.width = `${Math.floor(viewport.width)}px`;
    pdfCanvas.style.height = `${Math.floor(viewport.height)}px`;
    pdfPageShell.style.width = `${Math.floor(viewport.width)}px`;
    pdfPageShell.style.height = `${Math.floor(viewport.height)}px`;

    pdfRenderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      background: '#ffffff',
    });
    await pdfRenderTask.promise;
    if (renderVersion !== pdfRenderVersion) return;
    const textContent = await page.getTextContent();
    if (renderVersion !== pdfRenderVersion) return;
    pdfTextItems = extractPdfTextItems(textContent, viewport);
    renderPdfAnnotations();
    updatePdfControls();
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') showError('PDF 预览渲染失败', error.message);
  } finally {
    if (renderVersion === pdfRenderVersion) pdfLoading.hidden = true;
  }
}

async function loadPdfPreview(url) {
  pdfLoading.hidden = false;
  pdfUrl = url;
  const previousPage = pdfDocument ? pdfPage : 1;
  pdfRenderVersion += 1;
  pdfRenderTask?.cancel();
  if (pdfDocument) await pdfDocument.destroy();
  pdfDocument = null;
  pdfRotation = 0;
  pdfMode = 'width';
  resetPdfAnnotations();
  try {
    const loadingTask = getDocument({
      url,
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
      iccUrl: '/pdfjs/iccs/',
    });
    pdfDocument = await loadingTask.promise;
    pdfPage = Math.min(pdfDocument.numPages, Math.max(1, previousPage));
    preview.hidden = false;
    previewEmpty.hidden = true;
    await renderPdfPage();
  } catch (error) {
    preview.hidden = true;
    previewEmpty.hidden = false;
    throw new Error(`无法载入 PDF 预览：${error.message}`);
  } finally {
    pdfLoading.hidden = true;
  }
}

function setPdfPage(nextPage) {
  if (!pdfDocument) return;
  closePdfInlineEditor({ clearContext: true });
  pdfPage = Math.min(pdfDocument.numPages, Math.max(1, Number(nextPage) || 1));
  renderPdfPage();
}

function changePdfZoom(multiplier) {
  if (!pdfDocument) return;
  pdfScale = Math.min(3, Math.max(.35, pdfScale * multiplier));
  pdfMode = 'custom';
  renderPdfPage();
}

async function compile() {
  setBusy(true);
  consolePanel.hidden = true;
  syncActiveFile();
  try {
    const result = await request('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: entryFile, files: [...projectFiles.entries()].map(([path, source]) => ({ path, source })) }),
    });
    projectFiles.forEach((source, filePath) => savedSources.set(filePath, source));
    updateEditorState();
    compilerLabel.textContent = result.compiler;
    await loadPdfPreview(`/preview.pdf?entry=${encodeURIComponent(entryFile)}&t=${Date.now()}`);
    return true;
  } catch (error) {
    showError(error.message, error.details);
    return false;
  } finally {
    setBusy(false);
  }
}

function renderQuestion() {
  const question = interviewState.questions[interviewState.index];
  const roleSelect = document.querySelector('#interview-role');
  document.querySelector('#question-number').textContent = `QUESTION ${interviewState.index + 1} / ${interviewState.questions.length}`;
  document.querySelector('#question-role').textContent = roleSelect.options[roleSelect.selectedIndex].text;
  document.querySelector('#interview-question').textContent = question;
  document.querySelector('#interview-progress').textContent = `${interviewState.index + 1} / ${interviewState.questions.length}`;
  document.querySelector('#interview-feedback').hidden = true;
  document.querySelector('#interview-answer').value = '';
  document.querySelector('#interview-answer').focus();
}

function renderInterviewFeedback(result) {
  const container = document.querySelector('#interview-feedback');
  const heading = element('div', 'feedback-score');
  heading.append(element('strong', '', '本题反馈'), element('span', '', `${result.score}/100`));
  const signals = element('div', 'signal-row');
  const signalLabels = { context: '背景', action: '行动', result: '结果', reflection: '复盘' };
  Object.entries(result.signals).forEach(([key, pass]) => signals.append(element('span', `signal${pass ? ' pass' : ''}`, signalLabels[key])));
  const list = element('ul', 'feedback-list');
  result.feedback.forEach((feedback) => list.append(element('li', '', feedback)));
  const prompt = element('div', 'next-prompt', result.nextPrompt);
  container.replaceChildren(heading, signals, list, prompt);
  container.hidden = false;
}

async function startInterview() {
  const role = document.querySelector('#interview-role').value;
  const startButton = document.querySelector('#start-interview');
  startButton.disabled = true;
  try {
    const result = await request(`/api/interview/questions?role=${encodeURIComponent(role)}`);
    interviewState = { questions: result.questions, index: 0, awaitingNext: false, complete: false };
    document.querySelector('#interview-empty').hidden = true;
    document.querySelector('#interview-session').hidden = false;
    document.querySelector('#interview-answer').disabled = false;
    document.querySelector('#submit-answer').disabled = false;
    document.querySelector('#submit-answer').textContent = '提交回答';
    document.querySelector('#interview-role').disabled = true;
    startButton.textContent = '重新开始';
    renderQuestion();
  } catch (error) {
    showError('无法开始面试', error.message);
  } finally {
    startButton.disabled = false;
  }
}

function moveToNextQuestion() {
  const submitButton = document.querySelector('#submit-answer');
  if (interviewState.index >= interviewState.questions.length - 1) {
    interviewState.complete = true;
    submitButton.disabled = true;
    submitButton.textContent = '本轮已完成';
    document.querySelector('#interview-answer').disabled = true;
    document.querySelector('#interview-role').disabled = false;
    document.querySelector('#interview-progress').textContent = '本轮完成';
    return;
  }
  interviewState.index += 1;
  interviewState.awaitingNext = false;
  submitButton.textContent = '提交回答';
  renderQuestion();
}

async function submitInterviewAnswer() {
  if (interviewState.awaitingNext) {
    moveToNextQuestion();
    return;
  }
  const answer = document.querySelector('#interview-answer').value.trim();
  if (!answer) {
    document.querySelector('#interview-answer').focus();
    return;
  }
  const submitButton = document.querySelector('#submit-answer');
  submitButton.disabled = true;
  try {
    const result = await request('/api/interview/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: document.querySelector('#interview-role').value,
        question: interviewState.questions[interviewState.index],
        answer,
      }),
    });
    renderInterviewFeedback(result);
    interviewState.awaitingNext = true;
    submitButton.textContent = interviewState.index === interviewState.questions.length - 1 ? '完成本轮' : '下一题';
  } catch (error) {
    showError('回答评分失败', error.message);
  } finally {
    submitButton.disabled = false;
  }
}

const PANEL_LABELS = { editor: '编辑器', preview: 'PDF' };

function hiddenPanels() {
  return Object.keys(PANEL_LABELS).filter((panel) => workspace.classList.contains(`hide-${panel}`));
}

function renderPanelRestore() {
  panelRestore.replaceChildren();
  hiddenPanels().forEach((panel) => {
    const button = element('button', '', `显示 ${PANEL_LABELS[panel]}`);
    button.type = 'button';
    button.addEventListener('click', () => setPanelHidden(panel, false));
    panelRestore.append(button);
  });
  panelRestore.hidden = panelRestore.childElementCount === 0;
}

function setPanelHidden(panel, hidden) {
  workspace.classList.toggle(`hide-${panel}`, hidden);
  localStorage.setItem('cv-studio-hidden-panels', JSON.stringify(hiddenPanels()));
  renderPanelRestore();
}

function initializePanelState() {
  let panels = [];
  let sizes = {};
  try { panels = JSON.parse(localStorage.getItem('cv-studio-hidden-panels') || '[]'); } catch { panels = []; }
  try { sizes = JSON.parse(localStorage.getItem('cv-studio-workspace-sizes') || '{}'); } catch { sizes = {}; }
  panels = panels.filter((panel) => panel in PANEL_LABELS);
  Object.keys(PANEL_LABELS).forEach((panel) => workspace.classList.toggle(`hide-${panel}`, panels.includes(panel)));
  if (Number.isFinite(sizes.left)) workspace.style.setProperty('--workspace-left-width', `${sizes.left}px`);
  if (Number.isFinite(sizes.preview)) workspace.style.setProperty('--workspace-preview-height', `${sizes.preview}px`);
  if (Number.isFinite(sizes.files)) workspace.style.setProperty('--file-browser-width', `${sizes.files}px`);
  renderPanelRestore();
}

function persistWorkspaceSizes() {
  const left = Number.parseFloat(workspace.style.getPropertyValue('--workspace-left-width'));
  const previewHeight = Number.parseFloat(workspace.style.getPropertyValue('--workspace-preview-height'));
  const files = Number.parseFloat(workspace.style.getPropertyValue('--file-browser-width'));
  localStorage.setItem('cv-studio-workspace-sizes', JSON.stringify({ left, preview: previewHeight, files }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resizeWorkspace(orientation, clientX, clientY) {
  if (orientation === 'vertical') {
    const rect = workspace.getBoundingClientRect();
    workspace.style.setProperty('--workspace-left-width', `${clamp(clientX - rect.left, 300, rect.width - 360)}px`);
  } else if (orientation === 'files') {
    const editorColumn = document.querySelector('.editor-column');
    const rect = editorColumn.getBoundingClientRect();
    workspace.style.setProperty('--file-browser-width', `${clamp(clientX - rect.left, 96, Math.max(96, Math.min(240, rect.width - 180)))}px`);
  } else {
    const rect = workspace.getBoundingClientRect();
    workspace.style.setProperty('--workspace-preview-height', `${clamp(clientY - rect.top, 180, rect.height - 150)}px`);
  }
}

function initializeSplitter(splitter, orientation) {
  interact(splitter).draggable({
    inertia: { resistance: 28, minSpeed: 220, endSpeed: 80 },
    listeners: {
      start() {
        splitter.classList.add('dragging');
        document.body.classList.add('is-resizing');
        resizeHud.hidden = false;
      },
      move(event) {
        resizeWorkspace(orientation, event.clientX, event.clientY);
        const label = orientation === 'horizontal'
          ? `${Math.round(event.clientY - workspace.getBoundingClientRect().top)} px`
          : `${Math.round(event.clientX - (orientation === 'files' ? document.querySelector('.editor-column') : workspace).getBoundingClientRect().left)} px`;
        resizeHud.textContent = label;
        resizeHud.style.left = `${clamp(event.clientX + 12, 10, window.innerWidth - 90)}px`;
        resizeHud.style.top = `${clamp(event.clientY + 12, 80, window.innerHeight - 44)}px`;
      },
      end() {
        splitter.classList.remove('dragging');
        document.body.classList.remove('is-resizing');
        workspace.classList.add('resize-settling');
        resizeHud.hidden = true;
        window.setTimeout(() => workspace.classList.remove('resize-settling'), 180);
        persistWorkspaceSizes();
        editorView?.requestMeasure();
      },
    },
  });
  splitter.addEventListener('keydown', (event) => {
    const direction = orientation === 'horizontal' ? { ArrowUp: -16, ArrowDown: 16 } : { ArrowLeft: -16, ArrowRight: 16 };
    if (!(event.key in direction)) return;
    event.preventDefault();
    const splitterRect = splitter.getBoundingClientRect();
    const currentX = splitterRect.left + direction[event.key];
    const currentY = splitterRect.top + direction[event.key];
    resizeWorkspace(orientation, currentX, currentY);
    persistWorkspaceSizes();
  });
}

const AGENT_LAYOUT_CLASSES = ['agent-floating', 'agent-right-bottom', 'agent-right-top', 'agent-left-bottom', 'agent-left-full'];

function defaultAgentWindowState() {
  return { mode: 'floating', dock: 'right-bottom', open: false, x: null, y: 128, width: 500, height: 390 };
}

function persistAgentWindowState() {
  localStorage.setItem('cv-studio-agent-window', JSON.stringify(agentWindowState));
}

function applyAgentWindowState() {
  AGENT_LAYOUT_CLASSES.forEach((className) => workspace.classList.remove(className));
  const layoutClass = agentWindowState.mode === 'floating' ? 'agent-floating' : `agent-${agentWindowState.dock}`;
  workspace.classList.add(layoutClass);
  workspace.classList.remove('hide-agent');
  agentPane.classList.toggle('agent-minimized', !agentWindowState.open);
  pixelAgentLauncher.hidden = agentWindowState.open;
  pixelAgentLauncher.setAttribute('aria-expanded', String(agentWindowState.open));
  agentDockPosition.value = agentWindowState.mode === 'floating' ? 'floating' : agentWindowState.dock;

  const windowX = Number.isFinite(agentWindowState.x) ? `${agentWindowState.x}px` : 'calc(100vw - 540px)';
  workspace.style.setProperty('--agent-window-x', windowX);
  workspace.style.setProperty('--agent-window-y', `${agentWindowState.y}px`);
  workspace.style.setProperty('--agent-window-width', `${agentWindowState.width}px`);
  workspace.style.setProperty('--agent-window-height', `${agentWindowState.height}px`);

  const pinButton = document.querySelector('#agent-pin-button');
  const isFloating = agentWindowState.mode === 'floating';
  setLucideIcon(pinButton, isFloating ? 'pin' : 'maximize-2');
  pinButton.setAttribute('aria-label', isFloating ? '固定 Agent' : '取消固定');
  pinButton.title = isFloating ? '固定到工作区' : '切换为浮动窗口';
}

function initializeAgentWindow() {
  try {
    agentWindowState = { ...defaultAgentWindowState(), ...JSON.parse(localStorage.getItem('cv-studio-agent-window') || '{}') };
  } catch {
    agentWindowState = defaultAgentWindowState();
  }
  if (!['floating', 'docked'].includes(agentWindowState.mode)) agentWindowState.mode = 'floating';
  if (!['right-bottom', 'right-top', 'left-bottom', 'left-full'].includes(agentWindowState.dock)) agentWindowState.dock = 'right-bottom';
  agentWindowState.width = clamp(Number(agentWindowState.width) || 500, 460, 1000);
  agentWindowState.height = clamp(Number(agentWindowState.height) || 390, 300, 850);
  if (Number.isFinite(agentWindowState.x)) {
    agentWindowState.x = clamp(agentWindowState.x, 8, Math.max(8, window.innerWidth - agentWindowState.width - 12));
  }
  applyAgentWindowState();
}

function setAgentWindowState(patch) {
  const wasOpen = agentWindowState.open;
  agentWindowState = { ...agentWindowState, ...patch };
  applyAgentWindowState();
  persistAgentWindowState();
  if (!wasOpen && agentWindowState.open) {
    animateElement(agentPane, { opacity: [0, 1], scale: [.96, 1], y: [10, 0] }, { duration: .3 });
  }
}

function toggleAgentPin() {
  setAgentWindowState(agentWindowState.mode === 'floating'
    ? { mode: 'docked', open: true }
    : { mode: 'floating', open: true });
}

function initializeAgentDragging() {
  interact(agentPane)
    .draggable({
      allowFrom: '#agent-window-header',
      ignoreFrom: 'button, select, input, textarea',
      inertia: { resistance: 24, minSpeed: 260, endSpeed: 90 },
      modifiers: [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })],
      listeners: {
        start() {
          if (agentWindowState.mode !== 'floating') return;
          agentPane.classList.add('window-dragging');
        },
        move(event) {
          if (agentWindowState.mode !== 'floating') return;
          const rect = agentPane.getBoundingClientRect();
          agentWindowState.x = clamp((Number.isFinite(agentWindowState.x) ? agentWindowState.x : rect.left) + event.dx, 8, Math.max(8, window.innerWidth - rect.width - 8));
          agentWindowState.y = clamp(agentWindowState.y + event.dy, 70, Math.max(70, window.innerHeight - 70));
          workspace.style.setProperty('--agent-window-x', `${agentWindowState.x}px`);
          workspace.style.setProperty('--agent-window-y', `${agentWindowState.y}px`);
        },
        end() {
          if (agentWindowState.mode !== 'floating') return;
          agentPane.classList.remove('window-dragging');
          persistAgentWindowState();
        },
      },
    })
    .resizable({
      edges: { right: true, bottom: true },
      inertia: true,
      modifiers: [interact.modifiers.restrictSize({ min: { width: 440, height: 280 }, max: { width: 1000, height: 850 } })],
      listeners: {
        start() { if (agentWindowState.mode === 'floating') agentPane.classList.add('window-resizing'); },
        move(event) {
          if (agentWindowState.mode !== 'floating') return;
          agentWindowState.width = event.rect.width;
          agentWindowState.height = event.rect.height;
          workspace.style.setProperty('--agent-window-width', `${agentWindowState.width}px`);
          workspace.style.setProperty('--agent-window-height', `${agentWindowState.height}px`);
        },
        end() {
          agentPane.classList.remove('window-resizing');
          if (agentWindowState.mode === 'floating') persistAgentWindowState();
        },
      },
    });
}

function loadAgentSettings() {
  let settings = {};
  try {
    const stored = localStorage.getItem(GLOBAL_AI_SETTINGS_KEY);
    const legacy = localStorage.getItem('cv-studio-agent-settings');
    settings = JSON.parse(stored || legacy || '{}');
    if (!stored && legacy) localStorage.setItem(GLOBAL_AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch { settings = {}; }
  const providerType = ['local', 'openai', 'anthropic', 'hermes'].includes(settings.type) ? settings.type : 'local';
  document.querySelector('#agent-provider').value = providerType;
  document.querySelector('#agent-model').value = settings.model || '';
  document.querySelector('#agent-api-key').value = settings.apiKey || '';
  document.querySelector('#agent-base-url').value = settings.baseUrl || '';
  document.querySelector('#agent-api-mode').value = settings.apiMode || 'responses';
  document.querySelector('#agent-edit-mode').value = settings.editMode || 'review';
  updateAgentProviderUI();
}

function updateAgentProviderUI() {
  const type = document.querySelector('#agent-provider').value;
  const hasKey = Boolean(document.querySelector('#agent-api-key').value.trim()) || Boolean(agentEnvironmentKeys[type]);
  const modeLabel = document.querySelector('#agent-mode-label');
  const modelInput = document.querySelector('#agent-model');
  const baseUrlInput = document.querySelector('#agent-base-url');
  const apiMode = document.querySelector('#agent-api-mode');
  const notes = {
    local: '“本地检查”只运行确定性规则，不会伪装成 AI，也不会向外发送简历内容。',
    openai: 'Agent 会按需调用受限的项目读取、搜索、提案与临时编译工具。默认使用 Responses API。',
    anthropic: 'Agent 会按需调用受限项目工具。Anthropic 模式使用 Messages API，API mode 设置会被忽略。',
    hermes: '需先运行 hermes gateway。CV Studio 会发送受限项目快照；Hermes 在服务端运行自己的宽权限工具，请只连接可信实例。',
  };
  const defaults = {
    local: ['', ''],
    openai: ['gpt-5.6-terra', 'https://api.openai.com/v1'],
    anthropic: ['claude-sonnet-4-6', 'https://api.anthropic.com/v1'],
    hermes: ['hermes-agent', 'http://127.0.0.1:8642/v1'],
  };
  modelInput.placeholder = defaults[type][0] || '本地检查不使用模型';
  baseUrlInput.placeholder = defaults[type][1] || '本地检查不使用远程地址';
  apiMode.disabled = type === 'local' || type === 'anthropic';
  document.querySelector('#agent-provider-note').textContent = notes[type];
  const statusText = type === 'local' ? 'LOCAL RULES' : `${type.toUpperCase()}${hasKey ? ' · READY' : ' · NEEDS KEY'}`;
  modeLabel.textContent = statusText;
  document.querySelector('#intake-provider-badge').textContent = statusText;
  document.querySelector('.pixel-agent-label small').textContent = statusText;
  document.querySelector('#global-ai-status').textContent = type === 'local'
    ? '本地检查 · 未启用视觉模型'
    : `${type.toUpperCase()} · ${hasKey ? '已就绪' : '需要 API key'}`;
}

function saveAgentSettings(event) {
  event?.preventDefault();
  const settings = {
    type: document.querySelector('#agent-provider').value,
    model: document.querySelector('#agent-model').value.trim(),
    apiKey: document.querySelector('#agent-api-key').value.trim(),
    baseUrl: document.querySelector('#agent-base-url').value.trim(),
    apiMode: document.querySelector('#agent-api-mode').value,
    editMode: document.querySelector('#agent-edit-mode').value,
  };
  localStorage.setItem(GLOBAL_AI_SETTINGS_KEY, JSON.stringify(settings));
  updateAgentProviderUI();
  document.querySelector('#ai-settings-dialog').close();
}

function agentSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(GLOBAL_AI_SETTINGS_KEY) || '{"type":"local"}');
    return { ...settings, type: ['local', 'openai', 'anthropic', 'hermes'].includes(settings.type) ? settings.type : 'local' };
  } catch { return { type: 'local' }; }
}

function openAiSettings() {
  loadAgentSettings();
  const dialog = document.querySelector('#ai-settings-dialog');
  dialog.showModal();
  window.setTimeout(() => document.querySelector('#agent-provider').focus(), 60);
}

async function loadAgentProviderStatus() {
  try {
    const status = await request('/api/agent/status');
    agentEnvironmentKeys = status.environmentKeys || {};
    updateAgentProviderUI();
  } catch {
    agentEnvironmentKeys = {};
  }
}

function appendAgentMessage(role, text, label) {
  const message = element('div', `agent-message ${role}`);
  message.append(element('span', '', label), element('p', '', text));
  agentMessages.append(message);
  animateElement(message, { opacity: [0, 1], y: [8, 0] }, { duration: .28 });
  agentMessages.scrollTop = agentMessages.scrollHeight;
  return message;
}

function agentConversationKey() {
  return `cv-studio-agent-conversation:${projectName.title || 'workspace'}`;
}

function saveAgentConversation() {
  sessionStorage.setItem(agentConversationKey(), JSON.stringify(agentConversation.slice(-30)));
}

function loadAgentConversation() {
  try { agentConversation = JSON.parse(sessionStorage.getItem(agentConversationKey()) || '[]'); } catch { agentConversation = []; }
  if (!Array.isArray(agentConversation)) agentConversation = [];
  agentConversation = agentConversation.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-30);
  agentMessages.replaceChildren();
  if (!agentConversation.length) {
    appendAgentMessage('assistant', '本地检查可以立即分析结构；OpenAI / Anthropic 会用受限项目工具逐步读取、提案并临时编译，Hermes 则运行你自己的 Gateway Agent。', 'RESUME AGENT');
    return;
  }
  agentConversation.forEach((item) => appendAgentMessage(item.role, item.content, item.role === 'user' ? 'YOU' : 'RESUME AGENT'));
}

function clearAgentConversation() {
  agentConversation = [];
  sessionStorage.removeItem(agentConversationKey());
  agentMessages.replaceChildren();
  appendAgentMessage('assistant', '新对话已开始。我会重新读取需要的项目文件。', 'RESUME AGENT');
  agentInput.focus();
}

function renderAgentTrace(messageNode, trace) {
  if (!Array.isArray(trace) || !trace.length) return;
  const labels = {
    list_project_files: 'LIST',
    read_project_file: 'READ',
    search_project: 'SEARCH',
    inspect_resume: 'INSPECT',
    propose_file_edits: 'PROPOSE',
    compile_project: 'COMPILE',
    hermes_server_agent: 'HERMES',
  };
  const traceNode = element('div', 'agent-tool-trace');
  traceNode.append(element('span', 'agent-trace-label', 'TOOLS'));
  trace.forEach((item) => traceNode.append(element('span', 'agent-tool-chip', labels[item.tool] || item.tool)));
  messageNode.append(traceNode);
}

function renderPatchLines(pre, patch) {
  let rendered = 0;
  (patch.hunks || []).forEach((hunk) => {
    if (rendered >= 180) return;
    pre.append(element('span', 'diff-context', `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`));
    rendered += 1;
    (hunk.lines || []).forEach((line) => {
      if (rendered >= 180) return;
      const className = line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : 'diff-context';
      pre.append(element('span', className, line));
      rendered += 1;
    });
  });
  if (rendered >= 180) pre.append(element('span', 'diff-context', '… diff 已截断'));
}

async function applyAgentEdits(edits, proposals) {
  syncActiveFile();
  const staleEdit = edits.find((edit) => {
    const currentExists = projectFiles.has(edit.path);
    return currentExists !== edit.baseExists || (currentExists && projectFiles.get(edit.path) !== edit.baseSource);
  });
  if (staleEdit) {
    showError('无法应用 Agent 修改', `${staleEdit.path} 在提案生成后已经改变，请让 Agent 重新读取。`);
    return false;
  }
  proposals.forEach((proposal) => proposal.querySelectorAll('button').forEach((button) => { button.disabled = true; }));
  try {
    const result = await request('/api/agent/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: entryFile,
        edits: edits.map(({ operation, path, source, baseHash, baseExists }) => ({ operation, path, source, baseHash, baseExists })),
      }),
    });
    edits.forEach((edit) => {
      if (edit.operation === 'delete') {
        projectFiles.delete(edit.path);
        savedSources.delete(edit.path);
        projectEntries = projectEntries.filter((file) => file.path !== edit.path);
        return;
      }
      projectFiles.set(edit.path, edit.source);
      savedSources.set(edit.path, edit.source);
      const entry = projectEntries.find((file) => file.path === edit.path);
      if (entry) Object.assign(entry, { size: edit.source.length, editable: true, source: edit.source });
      else projectEntries.push({ path: edit.path, size: edit.source.length, editable: true, source: edit.source });
      if (edit.path === activeFile) setEditorValue(edit.source);
    });
    if (!projectFiles.has(activeFile)) {
      activeFile = projectFiles.has(entryFile) ? entryFile : projectFiles.keys().next().value || entryFile;
      setEditorValue(projectFiles.get(activeFile) || '');
      activeFileLabel.textContent = activeFile;
    }
    renderEntryOptions();
    renderFileList();
    updateEditorState();
    proposals.forEach((proposal, index) => {
      proposal.classList.add('applied');
      const actions = proposal.querySelector('.agent-edit-actions');
      const edit = edits[index];
      const deleted = edit.operation === 'delete' ? result.deleted?.find((item) => item.path === edit.path) : null;
      actions.replaceChildren(element('span', 'agent-edit-applied', deleted ? `已移至 ${deleted.trashPath}` : '已应用'));
    });
    return true;
  } catch (error) {
    showError('无法应用 Agent 修改', error.message);
    proposals.forEach((proposal) => proposal.querySelectorAll('button').forEach((button) => { button.disabled = false; }));
    return false;
  }
}

function renderAgentEdits(messageNode, edits) {
  const proposals = edits.map((edit) => {
    const operationLabel = { create: '新建', update: '修改', delete: '删除' }[edit.operation] || '修改';
    const proposal = element('div', `agent-edit-proposal operation-${edit.operation || 'update'}`);
    const heading = element('div', 'agent-edit-heading');
    heading.append(element('strong', '', edit.path), element('span', '', `${operationLabel} · ${edit.summary}`));
    const diff = element('pre', 'agent-edit-diff');
    renderPatchLines(diff, edit.patch || {});
    const actions = element('div', 'agent-edit-actions');
    const dismiss = element('button', '', '忽略');
    const apply = element('button', edit.operation === 'delete' ? 'delete' : 'apply', edit.operation === 'delete' ? '移至回收区' : '应用并更新 PDF');
    dismiss.type = 'button';
    apply.type = 'button';
    apply.setAttribute('aria-label', `${operationLabel}文件 ${edit.path}`);
    dismiss.addEventListener('click', () => proposal.remove());
    apply.addEventListener('click', async () => {
      if (await applyAgentEdits([edit], [proposal])) await compile();
    });
    actions.append(dismiss, apply);
    proposal.append(heading, diff, actions);
    messageNode.append(proposal);
    return proposal;
  });
  return proposals;
}

async function submitAgentMessage(event) {
  event.preventDefault();
  const message = agentInput.value.trim();
  if (!message || agentSendButton.disabled) return;
  syncActiveFile();
  appendAgentMessage('user', message, activeVisualContext ? `YOU · PDF P${activeVisualContext.page}` : 'YOU');
  agentInput.value = '';
  agentSendButton.disabled = true;
  const pending = appendAgentMessage('assistant', '正在读取项目上下文…', 'RESUME AGENT');
  pending.classList.add('working');
  try {
    const result = await request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        entry: entryFile,
        files: [...projectFiles.entries()].map(([path, source]) => ({ path, source })),
        provider: agentSettings(),
        history: agentConversation.slice(-12),
        visualContext: activeVisualContext ? {
          page: activeVisualContext.page,
          bounds: activeVisualContext.bounds,
          label: activeVisualContext.label,
          selectedText: activeVisualContext.selectedText,
          imageDataUrl: activeVisualContext.imageDataUrl,
        } : null,
      }),
    });
    pending.querySelector('span').textContent = result.mode === 'agent' ? result.model || 'MODEL AGENT' : 'LOCAL RULES';
    pending.querySelector('p').textContent = result.response;
    pending.classList.remove('working');
    renderAgentTrace(pending, result.trace);
    const proposals = renderAgentEdits(pending, result.edits || []);
    const includesDelete = result.edits?.some((edit) => edit.operation === 'delete');
    if (proposals.length && agentSettings().editMode === 'auto' && !includesDelete) {
      if (await applyAgentEdits(result.edits, proposals)) await compile();
    }
    agentConversation.push({ role: 'user', content: message }, { role: 'assistant', content: result.response });
    saveAgentConversation();
  } catch (error) {
    pending.classList.remove('working');
    pending.classList.add('error');
    pending.querySelector('span').textContent = 'REQUEST FAILED';
    pending.querySelector('p').textContent = error.message;
    if (!agentInput.value) agentInput.value = message;
  } finally {
    agentSendButton.disabled = false;
    agentMessages.scrollTop = agentMessages.scrollHeight;
    agentInput.focus();
  }
}

sidebarItems.forEach((item) => item.addEventListener('click', () => {
  switchView(item.dataset.view);
  if (item.dataset.view === 'intake-view' || item.dataset.view === 'bank-view') loadIntakeBank();
}));
document.querySelector('#enter-workspace').addEventListener('click', () => switchView('editor-view'));
document.querySelector('#hero-enter').addEventListener('click', () => switchView('editor-view'));
document.querySelector('#back-home').addEventListener('click', returnHome);
sidebarToggle.addEventListener('click', toggleSidebar);
document.querySelector('#new-file-button').addEventListener('click', createProjectFile);
document.querySelector('#cv-library-button').addEventListener('click', openCvLibrary);
document.querySelector('#cv-library-close').addEventListener('click', () => cvLibraryDialog.close());
cvLibraryOpenEditor.addEventListener('click', openSelectedCvInEditor);
document.querySelector('#cv-library-import').addEventListener('click', () => {
  cvLibraryDialog.close();
  chooseAndOpenProjectFolder().catch((error) => showError('无法打开项目', error.message));
});
document.querySelector('#cv-library-duplicate').addEventListener('click', () => {
  cvLibraryDialog.close();
  openCvDuplicateDialog();
});
cvDuplicateForm.addEventListener('submit', duplicateCurrentCv);
document.querySelector('#cv-duplicate-cancel').addEventListener('click', () => cvDuplicateDialog.close());
document.querySelector('#cv-duplicate-browse').addEventListener('click', async () => {
  if (!window.cvStudioDesktop?.selectProjectFolder) {
    document.querySelector('#cv-duplicate-parent').focus();
    return;
  }
  const selectedPath = await window.cvStudioDesktop.selectProjectFolder();
  if (selectedPath) document.querySelector('#cv-duplicate-parent').value = selectedPath;
});
intakeBox.addEventListener('paste', (event) => {
  const html = event.clipboardData?.getData('text/html');
  if (html) intakeRawHtml = [intakeRawHtml, html].filter(Boolean).join('\n').slice(0, 180_000);
  const files = [...(event.clipboardData?.files || [])];
  if (files.length) addIntakeFiles(files).catch((error) => showError('无法添加粘贴内容', error.message));
});
const intakeDropTargets = [intakeBox, document.querySelector('#intake-drop-zone')];
intakeDropTargets.forEach((target) => {
  target.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.querySelector('#intake-drop-zone').classList.add('dragging');
  });
  target.addEventListener('dragleave', () => document.querySelector('#intake-drop-zone').classList.remove('dragging'));
  target.addEventListener('drop', (event) => {
    event.preventDefault();
    document.querySelector('#intake-drop-zone').classList.remove('dragging');
    addIntakeFiles(event.dataTransfer?.files || []).catch((error) => showError('无法添加文件', error.message));
  });
});
document.querySelector('#intake-add-files').addEventListener('click', () => intakeFileInput.click());
intakeFileInput.addEventListener('change', () => {
  addIntakeFiles(intakeFileInput.files || []).catch((error) => showError('无法添加文件', error.message));
  intakeFileInput.value = '';
});
document.querySelector('#intake-analyze').addEventListener('click', analyzeIntake);
document.querySelector('#intake-commit').addEventListener('click', commitIntake);
document.querySelector('#intake-reset').addEventListener('click', () => resetIntakeReview(true));
document.querySelectorAll('.material-bank-column-header').forEach((header) => header.addEventListener('click', () => {
  activateMaterialBankColumn(header.closest('.material-bank-column').dataset.kind);
}));
materialBankDensity.querySelectorAll('button[data-density]').forEach((button) => button.addEventListener('click', () => {
  selectMaterialBankDensity(button.dataset.density);
}));
materialBankPageSize.addEventListener('change', () => selectMaterialBankPageSize(materialBankPageSize.value));
materialBankSearch.addEventListener('input', updateMaterialBankFilters);
materialBankCategory.addEventListener('change', updateMaterialBankFilters);
materialBankSelectAll.addEventListener('click', selectAllMaterialBankResults);
materialBankInvertSelection.addEventListener('click', invertMaterialBankResults);
materialBankClearSelection.addEventListener('click', clearMaterialBankSelection);
materialBankDeleteSelected.addEventListener('click', deleteSelectedMaterialBankItems);
Object.entries(materialBankPagination).forEach(([kind, pagination]) => {
  pagination.addEventListener('click', (event) => {
    const action = event.target.closest('button[data-page-action]')?.dataset.pageAction;
    if (!action) return;
    const delta = action === 'previous' ? -1 : 1;
    selectMaterialBankPage(kind, intakeBankPages[kind] + delta);
  });
});
document.querySelector('#intake-generate-cv').addEventListener('click', openIntakeGenerateDialog);
intakeGenerateForm.addEventListener('submit', generateCvFromIntake);
document.querySelector('#intake-generate-cancel').addEventListener('click', () => {
  if (intakeGenerationActive) intakeGenerationAbortController?.abort();
  else intakeGenerateDialog.close();
});
intakeGenerateDialog.addEventListener('cancel', (event) => {
  if (intakeGenerationActive) event.preventDefault();
});
intakeGenerateFit.addEventListener('change', updateIntakeGenerateFitDescription);
document.querySelectorAll('.pane-toggle').forEach((button) => button.addEventListener('click', () => setPanelHidden(button.dataset.panel, true)));
initializeSplitter(document.querySelector('#vertical-splitter'), 'vertical');
initializeSplitter(document.querySelector('#horizontal-splitter'), 'horizontal');
initializeSplitter(document.querySelector('#file-splitter'), 'files');
document.querySelector('#agent-settings-button').addEventListener('click', openAiSettings);
document.querySelector('#global-ai-settings').addEventListener('click', openAiSettings);
document.querySelector('#landing-ai-settings').addEventListener('click', openAiSettings);
document.querySelector('#ai-settings-form').addEventListener('submit', saveAgentSettings);
document.querySelector('#agent-cancel-settings').addEventListener('click', () => document.querySelector('#ai-settings-dialog').close());
document.querySelector('#agent-provider').addEventListener('change', updateAgentProviderUI);
document.querySelector('#agent-api-key').addEventListener('input', updateAgentProviderUI);
document.querySelector('#agent-clear-button').addEventListener('click', clearAgentConversation);
document.querySelector('#agent-form').addEventListener('submit', submitAgentMessage);
agentInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  document.querySelector('#agent-form').requestSubmit();
});
document.querySelector('#agent-pin-button').addEventListener('click', toggleAgentPin);
document.querySelector('#agent-minimize-button').addEventListener('click', () => setAgentWindowState({ open: false }));
pixelAgentLauncher.addEventListener('click', () => setAgentWindowState({ open: true }));
agentDockPosition.addEventListener('change', () => {
  if (agentDockPosition.value === 'floating') setAgentWindowState({ mode: 'floating', open: true });
  else setAgentWindowState({ dock: agentDockPosition.value, mode: 'docked', open: true });
});
entryFileSelect.addEventListener('change', () => changeEntryFile().catch((error) => showError('无法切换主文档', error.message)));
document.querySelector('#open-folder-button').addEventListener('click', () => {
  chooseAndOpenProjectFolder().catch((error) => showError('无法打开项目', error.message));
});
document.querySelector('#cancel-open-folder').addEventListener('click', () => document.querySelector('#open-folder-dialog').close());
document.querySelector('#open-folder-form').addEventListener('submit', (event) => {
  event.preventDefault();
  prepareProjectSwitch()
    .then((ready) => ready && openProjectFolder(document.querySelector('#project-folder-path').value.trim()))
    .catch((error) => showError('无法打开项目', error.message));
});
document.querySelector('#zen-button').addEventListener('click', toggleZenMode);
document.querySelector('#zen-exit-button').addEventListener('click', () => setZenMode(false));
document.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
document.querySelector('#landing-theme-toggle').addEventListener('click', toggleTheme);
saveButton.addEventListener('click', save);
compileButton.addEventListener('click', compile);
document.querySelector('#pdf-previous-page').addEventListener('click', () => setPdfPage(pdfPage - 1));
document.querySelector('#pdf-next-page').addEventListener('click', () => setPdfPage(pdfPage + 1));
document.querySelector('#pdf-zoom-out').addEventListener('click', () => changePdfZoom(1 / 1.15));
document.querySelector('#pdf-zoom-in').addEventListener('click', () => changePdfZoom(1.15));
document.querySelector('#pdf-review-button').addEventListener('click', enterPdfReviewMode);
document.querySelector('#pdf-inline-edit-button').addEventListener('click', () => enterPdfReviewMode('inline'));
document.querySelector('#pdf-exit-review').addEventListener('click', () => exitPdfReviewMode());
document.querySelector('#pdf-draw-region').addEventListener('click', () => setPdfAnnotationDrawing(!pdfAnnotationDrawing));
document.querySelector('#pdf-use-page').addEventListener('click', useCurrentPdfPage);
document.querySelector('#pdf-clear-regions').addEventListener('click', resetPdfAnnotations);
document.querySelector('#agent-clear-context').addEventListener('click', () => {
  if (pdfInlineSelection) closePdfInlineEditor({ clearContext: true });
  else clearActiveVisualContext();
});
pdfInlineEditor.addEventListener('submit', submitPdfInlineEdit);
document.querySelector('#pdf-inline-cancel').addEventListener('click', () => closePdfInlineEditor({ clearContext: true }));
pdfAnnotationCanvas.addEventListener('pointerdown', startPdfAnnotation);
pdfAnnotationCanvas.addEventListener('pointermove', continuePdfAnnotation);
pdfAnnotationCanvas.addEventListener('pointerup', finishPdfAnnotation);
pdfAnnotationCanvas.addEventListener('pointercancel', finishPdfAnnotation);
document.querySelector('#pdf-rotate').addEventListener('click', () => {
  if (!pdfDocument) return;
  pdfRotation = (pdfRotation + 90) % 360;
  pdfAnnotations.filter((annotation) => annotation.page === pdfPage).forEach((annotation) => {
    annotation.points = annotation.points.map(rotatePointClockwise);
    annotation.bounds = boundsForPoints(annotation.points);
  });
  clearActiveVisualContext();
  renderPdfPage();
});
document.querySelector('#pdf-download').addEventListener('click', () => {
  if (!pdfUrl) return;
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = `${entryFile.replace(/\.tex$/i, '') || 'resume'}.pdf`;
  link.click();
});
pdfPageNumber.addEventListener('change', () => setPdfPage(pdfPageNumber.value));
pdfPageNumber.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  setPdfPage(pdfPageNumber.value);
});
pdfFitMode.addEventListener('change', () => {
  if (!pdfDocument) return;
  pdfMode = pdfFitMode.value;
  renderPdfPage();
});
pdfStage.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    setPdfPage(pdfPage - 1);
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    setPdfPage(pdfPage + 1);
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    changePdfZoom(1.15);
  } else if (event.key === '-') {
    event.preventDefault();
    changePdfZoom(1 / 1.15);
  }
});
new ResizeObserver(() => {
  if (!pdfDocument || !['width', 'page'].includes(pdfMode)) return;
  clearTimeout(pdfResizeTimer);
  pdfResizeTimer = setTimeout(renderPdfPage, 120);
}).observe(pdfStage);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && pdfReviewActive) exitPdfReviewMode(false);
});
document.querySelector('#start-interview').addEventListener('click', startInterview);
document.querySelector('#submit-answer').addEventListener('click', submitInterviewAnswer);
document.querySelector('#close-console').addEventListener('click', () => { consolePanel.hidden = true; });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && pdfReviewActive) {
    event.preventDefault();
    exitPdfReviewMode();
    return;
  }
  if (event.key === 'Escape' && appView.classList.contains('zen-mode')) {
    event.preventDefault();
    setZenMode(false);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f' && activeView === 'editor-view') {
    event.preventDefault();
    toggleZenMode();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a' && activeView === 'editor-view') {
    event.preventDefault();
    setAgentWindowState({ open: !agentWindowState.open });
    return;
  }
  const unmodifiedNavigationKey = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  if (unmodifiedNavigationKey && !event.isComposing && !isTextEntryTarget(event.target)
    && activeView !== 'landing-view' && ['1', '2'].includes(event.key)) {
    switchView({ 1: 'editor-view', 2: 'interview-view' }[event.key]);
    return;
  }
  if (!(event.metaKey || event.ctrlKey) || activeView !== 'editor-view') return;
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    save();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    compile();
  }
});

async function initialize() {
  refreshIcons();
  initializeCodeEditor();
  setTheme(localStorage.getItem('cv-studio-theme') || 'light');
  setSidebarCollapsed(localStorage.getItem('cv-studio-sidebar-collapsed') === 'true');
  setZenMode(localStorage.getItem('cv-studio-zen-mode') === 'true');
  intakeBankDensity = localStorage.getItem('cv-studio-material-bank-density') === 'detailed' ? 'detailed' : 'compact';
  const savedMaterialBankPageSize = Number(localStorage.getItem('cv-studio-material-bank-page-size'));
  intakeBankPageSize = [5, 10, 20, 50].includes(savedMaterialBankPageSize) ? savedMaterialBankPageSize : 10;
  initializePanelState();
  initializeAgentWindow();
  initializeAgentDragging();
  loadCvLibrary();
  renderCvLibrary();
  await loadIntakeBank();
  loadAgentSettings();
  loadAgentProviderStatus();
  try {
    const projectState = await request('/api/project');
    applyProjectState(projectState);
  } catch (error) {
    showError('无法载入简历项目', error.message);
  }
}

initialize().then(() => {
  document.body.dataset.cvStudioReady = 'true';
  animateLanding();
});
