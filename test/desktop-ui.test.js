const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('uses a hardened Electron window and native macOS folder picker', () => {
  const main = read('desktop/main.cjs');
  const preload = read('desktop/preload.cjs');

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /showOpenDialog/);
  assert.match(main, /openDirectory/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('cvStudioDesktop'/);
  assert.match(preload, /ipcRenderer\.invoke\('cv-studio:select-project-folder'/);
});

test('waits for the renderer to settle before visual QA captures', () => {
  const main = read('desktop/main.cjs');

  assert.match(main, /CV_STUDIO_CAPTURE_PATH/);
  assert.match(main, /cvStudioReady/);
  assert.match(main, /CV_STUDIO_CAPTURE_THEME/);
  assert.match(main, /PDF preview did not become visible for capture/);
  assert.match(main, /setTimeout\(resolve, 1100\)/);
  assert.match(main, /capturePage\(\)/);
  assert.match(main, /fs\.writeFile[\s\S]*app\.quit\(\)/);
});

test('bundles the macOS visual system, local icons, and reduced-motion support', () => {
  const html = read('public/index.html');
  const styles = read('public/macos.css');
  const app = read('public/app.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(html, /href="\/macos\.css"/);
  assert.match(html, /data-lucide="folder-open"/);
  assert.match(styles, /-apple-system/);
  assert.match(styles, /backdrop-filter/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /from 'motion'/);
  assert.match(app, /style\.removeProperty\('transform'\)/);
  assert.match(app, /from 'lucide'/);
  assert.match(app, /window\.cvStudioDesktop\?\.selectProjectFolder/);
  assert.ok(packageJson.dependencies.motion);
  assert.ok(packageJson.dependencies.lucide);
});

test('uses a muted raw-minimal palette with restrained pixel accents', () => {
  const styles = read('public/macos.css');

  assert.match(styles, /Raw minimalism refinement/);
  assert.match(styles, /--accent:\s*#d9a087/);
  assert.match(styles, /\.landing-view::before\s*\{\s*display:\s*none/);
  assert.match(styles, /\.feature-item[^}]*border:\s*0;[^}]*box-shadow:\s*none/s);
  assert.match(styles, /\.pixel-agent-face/);
  assert.doesNotMatch(styles, /#ff6b35|#ff7542/);
});

test('softens major surfaces with selective glass and rounded corners', () => {
  const styles = read('public/macos.css');

  assert.match(styles, /Soft material refinement/);
  assert.match(styles, /--glass:\s*rgb\(250 248 243 \/ 76%\)/);
  assert.match(styles, /\.hero-scene[^}]*border-radius:\s*18px[^}]*backdrop-filter/s);
  assert.match(styles, /\.workspace\.agent-floating \.agent-pane[\s\S]*?border-radius:\s*15px[\s\S]*?backdrop-filter/s);
  assert.match(styles, /\.tool-panel[^}]*border-radius:\s*14px[^}]*backdrop-filter/s);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test('bundles an application-owned PDF.js viewer and aligned editor controls', () => {
  const html = read('public/index.html');
  const styles = read('public/macos.css');
  const app = read('public/app.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.dependencies['pdfjs-dist'], '5.4.624');
  assert.match(packageJson.scripts['build:pdf-assets'], /build-pdf-assets\.mjs/);
  assert.match(packageJson.scripts['build:pdf-worker'], /pdf\.worker\.min\.mjs/);
  assert.ok(packageJson.build.extraResources[1].filter.includes('!**/.cvstudio-bank/**'));
  assert.match(html, /id="pdf-stage"/);
  assert.match(html, /id="pdf-fit-mode"/);
  assert.match(html, /id="pdf-canvas"/);
  assert.doesNotMatch(html, /<iframe id="preview"/);
  assert.match(app, /from 'pdfjs-dist\/build\/pdf\.mjs'/);
  assert.match(app, /GlobalWorkerOptions\.workerSrc = '\/pdf\.worker\.min\.mjs'/);
  assert.match(app, /cMapUrl:\s*'\/pdfjs\/cmaps\/'/);
  assert.match(app, /standardFontDataUrl:\s*'\/pdfjs\/standard_fonts\/'/);
  assert.match(app, /async function renderPdfPage/);
  assert.match(styles, /\.editor-toolbar \.button\.editor-action[^}]*display:\s*inline-flex[^}]*align-items:\s*center/s);
  assert.match(styles, /\.pdf-viewer[^}]*display:\s*flex/s);
});

test('provides a shared AI profile and accessible PDF-to-Agent review controls', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  const styles = read('public/macos.css');

  assert.match(html, /id="ai-settings-dialog"/);
  assert.match(html, /id="global-ai-settings"/);
  assert.match(html, /id="pdf-review-button"/);
  assert.match(html, /id="pdf-annotation-canvas"/);
  assert.match(html, /id="pdf-use-page"[^>]*aria-label="把当前整页交给 Agent"/);
  assert.match(html, /id="agent-visual-context"/);
  assert.match(app, /cv-studio-global-ai-settings/);
  assert.match(app, /getTextContent\(\)/);
  assert.match(app, /imageDataUrl:\s*activeVisualContext\.imageDataUrl/);
  assert.match(styles, /body\.pdf-review-mode \.preview-pane/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test('keeps the pending agent message geometry stable while it animates', () => {
  const styles = read('public/styles.css');
  const app = read('public/app.js');

  assert.match(styles, /\.agent-message\.working p::after\s*\{[^}]*width:\s*18px[^}]*height:\s*1em[^}]*content:\s*""/s);
  assert.match(styles, /@keyframes pixel-wait\s*\{[^}]*opacity:/s);
  assert.doesNotMatch(styles, /@keyframes pixel-wait[^}]*content:/s);
  assert.match(app, /animateElement\(message,\s*\{\s*opacity:\s*\[0,\s*1\],\s*y:\s*\[8,\s*0\]\s*\}/);
  assert.doesNotMatch(app, /animateElement\(message,[^\n]*scale:/);
});

test('does not treat Shift+2 or typing in an editor as page navigation', () => {
  const app = read('public/app.js');

  assert.match(app, /function isTextEntryTarget\(target\)/);
  assert.match(app, /!event\.altKey\s*&&\s*!event\.shiftKey/);
  assert.match(app, /!event\.isComposing\s*&&\s*!isTextEntryTarget\(event\.target\)/);
});

test('renders file deletion as an explicit manual recovery action', () => {
  const app = read('public/app.js');
  const styles = read('public/styles.css');

  assert.match(app, /operationLabel\s*=\s*\{\s*create:\s*'新建',\s*update:\s*'修改',\s*delete:\s*'删除'/);
  assert.match(app, /'移至回收区'/);
  assert.match(app, /editMode\s*===\s*'auto'\s*&&\s*!includesDelete/);
  assert.match(styles, /\.agent-edit-actions button\.delete/);
});

test('provides an accessible persistent multi-CV project library', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  const styles = read('public/styles.css');
  const server = read('server.js');

  assert.match(html, /id="cv-library-button"/);
  assert.match(html, /id="cv-library-list"[^>]*role="list"/);
  assert.match(html, /id="cv-duplicate-form"/);
  assert.match(app, /cv-studio-project-library/);
  assert.match(app, /async function switchCvProject/);
  assert.match(app, /openProjectFolder\(root, project\.entry\)/);
  assert.match(app, /hasUnsavedProjectFiles\(\)/);
  assert.match(server, /\/api\/project\/duplicate/);
  assert.match(server, /\.cvstudio-trash/);
  assert.match(styles, /\.cv-project-card/);
});

test('provides a mixed-content Agent intake and animated three-column information bank', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  const styles = read('public/styles.css');
  const server = read('server.js');
  const runtime = read('intake-runtime.mjs');

  assert.match(html, /data-lucide="database"[^>]*><\/i><\/span><strong>材料库<\/strong>[\s\S]*?data-view="intake-view"[\s\S]*?<strong>收件箱<\/strong>[\s\S]*?data-view="bank-view"[\s\S]*?<strong>信息银行<\/strong>[\s\S]*?<strong>简历工作流<\/strong>/);
  assert.match(html, /<strong>简历工作流<\/strong>[\s\S]*?<strong>我的简历<\/strong>[\s\S]*?data-view="editor-view"/);
  assert.match(app, /CopyPlus, Database, FilePlus2, FileText/);
  assert.match(html, /id="intake-view"[^>]*aria-label="材料库收件箱"/);
  assert.match(html, /id="bank-view"[^>]*aria-label="信息银行"/);
  assert.match(html, /id="intake-box"/);
  assert.match(html, /id="intake-file-input"[^>]*multiple/);
  assert.doesNotMatch(html, /data-kind="cv"/);
  assert.match(html, /id="material-bank-columns"[^>]*data-active-kind="all"/);
  assert.match(html, /data-kind="all"[\s\S]*?<strong>全部<\/strong>[\s\S]*?data-kind="job"[\s\S]*?<strong>职位描述<\/strong>[\s\S]*?data-kind="personal"[\s\S]*?<strong>个人信息<\/strong>/);
  assert.match(html, /data-kind="job"/);
  assert.match(html, /data-kind="personal"/);
  assert.match(html, /id="intake-generate-dialog"/);
  assert.match(app, /clipboardData\?\.files/);
  assert.match(app, /async function analyzeIntake/);
  assert.match(app, /async function commitIntake/);
  assert.match(app, /renderMaterialBank\(\);\s*await switchView\('bank-view'\)/);
  assert.match(app, /async function generateCvFromIntake/);
  assert.match(app, /async function extractPdfIntakeData/);
  assert.match(app, /getDocument\(\{[\s\S]*previewImages/s);
  assert.match(app, /function renderStructuredMaterial/);
  assert.match(app, /function materialStatusLabel/);
  assert.match(app, /function activateMaterialBankColumn/);
  assert.match(app, /PERSONAL_CATEGORY_META/);
  assert.match(app, /录入日期/);
  assert.match(app, /function updateIntakeCommitAvailability/);
  assert.match(app, /const unreadable = intakeSegments\.filter/);
  assert.match(html, /图片或扫描 PDF 若未被读懂，不能直接入库/);
  assert.match(server, /\/api\/intake\/classify/);
  assert.match(server, /\/api\/intake\/commit/);
  assert.match(server, /\/api\/intake\/generate/);
  assert.match(server, /hasMeaningfulExtractedContent/);
  assert.match(runtime, /geekplux\/cv_resume/);
  assert.match(runtime, /extractionStatus/);
  assert.match(styles, /\.material-bank-list/);
  assert.match(styles, /\.material-bank-column\.active[^}]*flex:/);
  assert.match(styles, /cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(styles, /\.material-card-lifecycle/);
  assert.match(styles, /\.structured-material/);
  assert.match(styles, /\.intake-review-card\.unreadable/);
});
