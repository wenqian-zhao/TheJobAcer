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
  ScanLine, Settings2, Sparkles, SunMoon, Trash2, User, X, ZoomIn, ZoomOut,
} from 'lucide';
import interact from 'interactjs';
import { boundsForPoints, rotatePointClockwise, textForPdfRegion } from './pdf-context.mjs';

const lucideIcons = {
  ArrowRight, ArrowUp, Briefcase, ChevronLeft, ChevronRight, Code2, CopyPlus, Download,
  Database, FilePlus2, FileText, Focus, FolderOpen, FolderPlus, Image, Inbox, KeyRound, Library, Maximize2,
  List, MessageCircle, Minus, Pencil, Pin, Play, RotateCcw, RotateCw, Save, ScanLine,
  Settings2, Sparkles, SunMoon, Trash2, User, X, ZoomIn, ZoomOut,
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
  all: document.querySelector('#material-bank-list'),
  job: document.querySelector('#material-bank-list-job'),
  personal: document.querySelector('#material-bank-list-personal'),
};
const intakeGenerateDialog = document.querySelector('#intake-generate-dialog');
const intakeGenerateForm = document.querySelector('#intake-generate-form');
const resizeHud = document.querySelector('#resize-hud');
const editorTheme = new Compartment();
const viewMeta = {
  'editor-view': ['LATEX EDITOR', '编辑器', '编辑源码，编译并查看你的简历。'],
  'intake-view': ['MATERIAL LIBRARY · INBOX', '收件箱', '录入新材料，由 Agent 提取并整理为可复用信息。'],
  'bank-view': ['MATERIAL LIBRARY · INFORMATION BANK', '信息银行', '查看已入库信息的基本内容、当前状态和录入日期。'],
  'interview-view': ['MOCK INTERVIEW', '模拟面试', '用几轮练习，把回答说得更清楚。'],
};

let projectFiles = new Map();
let projectEntries = [];
let cvLibrary = [];
let intakeAttachments = [];
let intakeSegments = [];
let intakeBank = { items: [], counts: { job: 0, personal: 0 } };
let intakeBankKind = 'all';
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
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed.');
    error.details = body.details || '';
    throw error;
  }
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
  if (!cvLibrary.length) {
    cvLibraryList.append(element('p', 'cv-library-empty', '还没有保存的 CV 项目。导入文件夹或复制当前 CV 开始。'));
    return;
  }
  cvLibrary.forEach((project) => {
    const current = project.root === currentProjectRoot;
    const card = element('div', `cv-project-card${current ? ' current' : ''}`);
    card.setAttribute('role', 'listitem');
    const open = element('button', 'cv-project-open');
    open.type = 'button';
    open.disabled = current;
    open.setAttribute('aria-label', current ? `当前 CV：${project.name}` : `切换到 CV：${project.name}`);
    const copy = element('span', 'cv-project-copy');
    copy.append(element('strong', '', project.name), element('small', '', project.root));
    open.append(element('span', 'cv-project-mark', current ? '●' : '○'), copy, element('span', 'cv-project-entry', project.entry || 'resume.tex'));
    open.addEventListener('click', () => switchCvProject(project));
    const remove = element('button', 'cv-project-remove', '×');
    remove.type = 'button';
    remove.disabled = current;
    remove.setAttribute('aria-label', `从简历库移除 ${project.name}`);
    remove.title = current ? '当前 CV 不能从列表移除' : '仅从列表移除，不删除磁盘文件';
    remove.addEventListener('click', () => {
      cvLibrary = cvLibrary.filter((item) => item.root !== project.root);
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
  if (!root || root === currentProjectRoot || !await prepareProjectSwitch()) return;
  try {
    await openProjectFolder(root, project.entry);
    cvLibraryDialog.close();
  } catch (error) {
    showError('无法切换 CV', error.message);
  }
}

function openCvLibrary() {
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

function hasExtractedIntakeContent(item = {}) {
  if (typeof item.content === 'string' && item.content.trim()) return true;
  const fields = item.fields || {};
  if (Object.values(fields.profile || {}).some((value) => typeof value === 'string' && value.trim())) return true;
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
    const warning = element('p', 'intake-extraction-warning', '这个来源还没有可复用的提取内容，不能直接把原始图片或 PDF 当作知识入库。请启用视觉模型重新分析、在下方补写可靠的转录/描述，或移除此条。');
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
  try {
    const result = await request('/api/intake/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        attachments: intakeAttachments.map(({ name, mimeType, dataUrl, text: extractedText, previewImages }) => ({ name, mimeType, dataUrl, text: extractedText, previewImages })),
        provider: agentSettings(),
      }),
    });
    intakeSegments = Array.isArray(result.segments) ? result.segments : [];
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
  try {
    const result = await request('/api/intake/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: intakeBox.value.trim(),
        html: intakeRawHtml,
        attachments: intakeAttachments.map(({ name, dataUrl, text }) => ({ name, dataUrl, text })),
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
  profile: ['个人简介', 0],
  contact: ['联系方式', 1],
  summary: ['个人简介', 0],
  experience: ['工作经历', 2],
  project: ['项目经历', 3],
  education: ['教育经历', 4],
  skill: ['专业技能', 5],
  award: ['荣誉和奖项', 6],
  extracurricular: ['课外活动', 7],
  social_practice: ['社会实践', 8],
  publication: ['论文发表', 9],
  talk: ['演讲和讲座', 10],
  photo: ['个人照片', 11],
  other: ['其他个人信息', 12],
};

function materialPersonalCategory(item) {
  const fields = item?.fields || {};
  const explicit = fields.personal?.category;
  if (explicit && explicit !== 'other') return explicit;
  if (Object.values(fields.profile || {}).some(Boolean)) return 'profile';
  if (fields.experiences?.length) return 'experience';
  if (fields.projects?.length) return 'project';
  if (fields.education?.length) return 'education';
  if (fields.skills?.length) return 'skill';
  return 'other';
}

function materialKindLabel(item) {
  return item.kind === 'job' ? '职位描述' : (PERSONAL_CATEGORY_META[materialPersonalCategory(item)] || PERSONAL_CATEGORY_META.other)[0];
}

function materialPriority(item) {
  if (item.kind === 'job') return 50;
  return (PERSONAL_CATEGORY_META[materialPersonalCategory(item)] || PERSONAL_CATEGORY_META.other)[1];
}

function materialStatusLabel(item) {
  return item.status === 'archived' ? '已归档' : item.extractionStatus === 'unreadable' ? '待完善' : '可使用';
}

function materialRecordedDate(item) {
  const value = item.recordedAt || item.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : date.toLocaleDateString('zh-CN');
}

function createMaterialCard(item) {
  const category = item.kind === 'job' ? 'job' : materialPersonalCategory(item);
  const card = element('article', `material-card kind-${item.kind} category-${category}`);
  card.setAttribute('role', 'listitem');
  const body = element('div', 'material-card-body');
  const meta = element('div', 'material-card-meta');
  meta.append(element('span', 'material-kind', materialKindLabel(item)));
  const lifecycle = element('div', 'material-card-lifecycle');
  const status = element('span', `material-status status-${item.status || 'active'}`, `状态 · ${materialStatusLabel(item)}`);
  const recorded = element('time', 'material-recorded-at', `录入日期 ${materialRecordedDate(item)}`);
  recorded.dateTime = item.recordedAt || item.createdAt || '';
  lifecycle.append(status, recorded);
  const title = element('strong', '', item.title || materialKindLabel(item));
  const structured = renderStructuredMaterial(item, true);
  const summary = element('p', 'material-card-summary', item.summary || item.content || '已提取为可复用内容');
  body.append(meta, title, lifecycle);
  if (structured) body.append(structured);
  else body.append(summary);
  const sourceEvidence = element('div', 'material-source-evidence');
  const imageAsset = item.assets?.find((asset) => asset.mimeType?.startsWith('image/'));
  if (imageAsset) {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'material-card-thumbnail';
    thumbnail.src = imageAsset.url;
    thumbnail.alt = `${item.title} 的来源附件预览`;
    sourceEvidence.append(thumbnail);
  }
  sourceEvidence.append(element('small', '', `已提取${item.assets?.length ? ` · ${item.assets.length} 个来源附件` : ' · 无附件来源'}`));
  body.append(sourceEvidence);
  const remove = element('button', 'material-card-remove', '×');
  remove.type = 'button';
  remove.title = '从信息银行移除';
  remove.setAttribute('aria-label', `从信息银行移除 ${item.title}`);
  remove.addEventListener('click', async () => {
    if (!window.confirm(`从信息银行移除“${item.title}”？原始提交和附件仍保留在本机归档中。`)) return;
    try {
      const result = await request(`/api/intake/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      intakeBank = result.bank;
      renderMaterialBank();
    } catch (error) {
      showError('无法移除信息', error.message);
    }
  });
  card.append(body, remove);
  return card;
}

function activateMaterialBankColumn(kind, shouldAnimate = true) {
  if (!materialBankLists[kind]) return;
  intakeBankKind = kind;
  materialBankColumns.dataset.activeKind = kind;
  materialBankColumns.querySelectorAll('.material-bank-column').forEach((column) => {
    const active = column.dataset.kind === kind;
    const header = column.querySelector('.material-bank-column-header');
    const content = column.querySelector('.material-bank-column-content');
    column.classList.toggle('active', active);
    header.setAttribute('aria-expanded', String(active));
    content.setAttribute('aria-hidden', String(!active));
    content.inert = !active;
    if (active && shouldAnimate) animateElement(content, { opacity: [.25, 1], x: [18, 0], scale: [.985, 1] }, { duration: .46 });
  });
}

function renderMaterialBank() {
  const items = Array.isArray(intakeBank.items) ? intakeBank.items : [];
  const counts = intakeBank.counts || { job: 0, personal: 0 };
  document.querySelector('#bank-count-all').textContent = String(items.length);
  document.querySelector('#bank-count-job').textContent = String(counts.job || 0);
  document.querySelector('#bank-count-personal').textContent = String(counts.personal || 0);
  document.querySelector('#intake-sidebar-count').textContent = `${items.length} 条已入库信息`;
  document.querySelector('#intake-generate-cv').disabled = !Number(counts.personal);
  const sorted = [...items].sort((left, right) => materialPriority(left) - materialPriority(right)
    || String(right.recordedAt || right.createdAt || '').localeCompare(String(left.recordedAt || left.createdAt || '')));
  Object.entries(materialBankLists).forEach(([kind, list]) => {
    list.replaceChildren();
    const visible = sorted.filter((item) => kind === 'all' || item.kind === kind);
    if (!visible.length) {
      const message = kind === 'all' ? '信息银行还是空的。请先到收件箱录入第一批材料。'
        : kind === 'job' ? '还没有职位描述。' : '还没有个人信息。请录入简历或个人材料进行解析。';
      list.append(element('p', 'material-bank-empty', message));
      return;
    }
    visible.slice(0, 120).forEach((item) => list.append(createMaterialCard(item)));
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

function openIntakeGenerateDialog() {
  const jobs = (intakeBank.items || []).filter((item) => item.kind === 'job');
  const jobSelect = document.querySelector('#intake-generate-job');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '不指定职位';
  jobSelect.replaceChildren(empty, ...jobs.map((job) => {
    const option = document.createElement('option');
    option.value = job.id;
    option.textContent = [job.fields?.job?.title || job.title, job.fields?.job?.company].filter(Boolean).join(' · ');
    return option;
  }));
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector('#intake-generate-name').value = `generated-cv-${today}`;
  document.querySelector('#intake-generate-parent').value = currentProjectRoot.replace(/[\\/][^\\/]+$/, '');
  intakeGenerateDialog.showModal();
  window.setTimeout(() => document.querySelector('#intake-generate-name').select(), 60);
}

async function generateCvFromIntake(event) {
  event.preventDefault();
  if (!await prepareProjectSwitch()) return;
  const submit = document.querySelector('#intake-generate-submit');
  submit.disabled = true;
  try {
    const state = await request('/api/intake/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.querySelector('#intake-generate-name').value.trim(),
        parentPath: document.querySelector('#intake-generate-parent').value.trim(),
        jobId: document.querySelector('#intake-generate-job').value,
      }),
    });
    applyProjectState(state);
    intakeGenerateDialog.close();
    await switchView('editor-view');
  } catch (error) {
    showError('无法生成 CV', error.message);
  } finally {
    submit.disabled = false;
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

function resetPdfAnnotations() {
  pdfAnnotations = [];
  pdfAnnotationDraft = null;
  nextAnnotationId = 1;
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

function enterPdfReviewMode() {
  if (!pdfDocument || pdfReviewActive) return;
  pdfReviewActive = true;
  pdfModeBeforeReview = pdfMode;
  document.body.classList.add('pdf-review-mode');
  previewPane.classList.add('pdf-review-active');
  document.documentElement.requestFullscreen?.().catch(() => {});
  pdfMode = 'page';
  setPdfAnnotationDrawing(true);
  window.setTimeout(renderPdfPage, 80);
}

function exitPdfReviewMode(exitFullscreen = true) {
  if (!pdfReviewActive) return;
  pdfReviewActive = false;
  setPdfAnnotationDrawing(false);
  document.body.classList.remove('pdf-review-mode');
  previewPane.classList.remove('pdf-review-active');
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
  pdfRenderVersion += 1;
  pdfRenderTask?.cancel();
  if (pdfDocument) await pdfDocument.destroy();
  pdfDocument = null;
  pdfPage = 1;
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
  } catch (error) {
    showError(error.message, error.details);
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
    const apply = element('button', edit.operation === 'delete' ? 'delete' : 'apply', edit.operation === 'delete' ? '移至回收区' : '应用修改');
    dismiss.type = 'button';
    apply.type = 'button';
    apply.setAttribute('aria-label', `${operationLabel}文件 ${edit.path}`);
    dismiss.addEventListener('click', () => proposal.remove());
    apply.addEventListener('click', () => applyAgentEdits([edit], [proposal]));
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
    if (proposals.length && agentSettings().editMode === 'auto' && !includesDelete) await applyAgentEdits(result.edits, proposals);
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
document.querySelector('#intake-generate-cv').addEventListener('click', openIntakeGenerateDialog);
intakeGenerateForm.addEventListener('submit', generateCvFromIntake);
document.querySelector('#intake-generate-cancel').addEventListener('click', () => intakeGenerateDialog.close());
document.querySelector('#intake-generate-browse').addEventListener('click', async () => {
  if (!window.cvStudioDesktop?.selectProjectFolder) {
    document.querySelector('#intake-generate-parent').focus();
    return;
  }
  const selectedPath = await window.cvStudioDesktop.selectProjectFolder();
  if (selectedPath) document.querySelector('#intake-generate-parent').value = selectedPath;
});
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
document.querySelector('#pdf-exit-review').addEventListener('click', () => exitPdfReviewMode());
document.querySelector('#pdf-draw-region').addEventListener('click', () => setPdfAnnotationDrawing(!pdfAnnotationDrawing));
document.querySelector('#pdf-use-page').addEventListener('click', useCurrentPdfPage);
document.querySelector('#pdf-clear-regions').addEventListener('click', resetPdfAnnotations);
document.querySelector('#agent-clear-context').addEventListener('click', clearActiveVisualContext);
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
