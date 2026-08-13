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
  assert.match(main, /captureView === 'pdf-inline'/);
  assert.match(main, /querySelector\('\.pdf-text-hit'\)\?\.click\(\)/);
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

test('keeps the original lightweight motion without animated blur', () => {
  const base = read('public/styles.css');
  const macos = read('public/macos.css');
  const app = read('public/app.js');

  assert.match(base, /\.view-enter\s*\{\s*animation:\s*view-enter \.28s/);
  assert.match(app, /animate\(targets,\s*\{\s*opacity:\s*\[0,\s*1\],\s*y:\s*\[14,\s*0\]\s*\}/);
  assert.doesNotMatch(app, /function (?:revealGlass|dismissGlass)/);
  assert.doesNotMatch(app, /filter:\s*\[[^\]]*blur/);
  assert.doesNotMatch(base, /@keyframes (?:glass-surface|glass-item|bank-glass)/);
  assert.doesNotMatch(macos, /glass-root-in|glass-wait/);
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

test('supports in-place PDF text editing with a LaTeX review and recompile loop', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  const styles = read('public/macos.css');

  assert.match(html, /id="pdf-inline-edit-button"[^>]*aria-label="直接编辑 PDF 中的文字并同步到 LaTeX"/);
  assert.match(html, /id="pdf-inline-editor"[^>]*hidden/);
  assert.match(html, /id="pdf-inline-replacement"/);
  assert.match(app, /textLineForPdfItem/);
  assert.match(app, /function openPdfInlineEditor/);
  assert.match(app, /执行一次 PDF 原位编辑/);
  assert.match(app, /if \(await applyAgentEdits\(\[edit\], \[proposal\]\)\) await compile\(\)/);
  assert.match(styles, /\.pdf-text-hit:hover/);
  assert.match(styles, /\.pdf-inline-editor\[hidden\]/);
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
  assert.match(html, /id="cv-library-selection-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="cv-library-open-editor"[^>]*disabled[^>]*>[\s\S]*?在编辑器中打开/);
  assert.match(html, /id="cv-duplicate-form"/);
  assert.match(app, /cv-studio-project-library/);
  assert.match(app, /async function switchCvProject/);
  assert.match(app, /openProjectFolder\(root, project\.entry\)/);
  assert.match(app, /open\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(app, /async function openSelectedCvInEditor\(\)[\s\S]*?switchCvProject\(project\)[\s\S]*?switchView\('editor-view'\)/);
  assert.match(app, /hasUnsavedProjectFiles\(\)/);
  assert.match(server, /\/api\/project\/duplicate/);
  assert.match(server, /\.cvstudio-trash/);
  assert.match(styles, /\.cv-project-card/);
  assert.match(styles, /\.cv-project-card\.selected/);
});

test('provides a mixed-content Agent intake and a paginated two-column information bank', () => {
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
  assert.match(html, /id="material-bank-density"[^>]*role="group"[^>]*aria-label="信息展示密度"[\s\S]*?data-density="compact"[^>]*aria-pressed="true">精简<[\s\S]*?data-density="detailed"[^>]*aria-pressed="false">详细</);
  assert.match(html, /id="material-bank-page-size"[\s\S]*?<option value="5">5<[\s\S]*?<option value="10" selected>10<[\s\S]*?<option value="20">20<[\s\S]*?<option value="50">50</);
  assert.match(html, /id="material-bank-search"[^>]*type="search"[^>]*抖音/);
  assert.match(html, /id="material-bank-category"[\s\S]*?<option value="profile">个人信息<[\s\S]*?<option value="publication">论文发表</);
  assert.match(html, /id="material-bank-select-all"[\s\S]*?id="material-bank-invert-selection"[\s\S]*?id="material-bank-clear-selection"/);
  assert.match(html, /id="material-bank-delete-selected"[^>]*disabled[\s\S]*?>批量删除</);
  assert.match(html, /id="intake-generate-cv"[^>]*disabled[\s\S]*?用已选内容生成 CV/);
  assert.match(html, /id="material-bank-columns"[^>]*data-active-kind="personal"[^>]*aria-label="信息银行分类视图"[\s\S]*?data-kind="job"[\s\S]*?>职位描述<[\s\S]*?data-kind="personal"[\s\S]*?>个人信息</);
  assert.doesNotMatch(html, /data-kind="all"|bank-count-all|bank-panel-all|>全部</);
  assert.match(html, /aria-controls="bank-panel-job"[\s\S]*?id="bank-panel-job"[^>]*aria-hidden="true"[^>]*inert[^>]*hidden/);
  assert.equal((html.match(/id="material-bank-list-(?:job|personal)"/g) || []).length, 2);
  assert.equal((html.match(/id="material-bank-pagination-(?:job|personal)"/g) || []).length, 2);
  assert.match(html, /id="intake-generate-dialog"/);
  assert.match(html, /id="intake-generate-summary-items"[^>]*aria-label="已锁定的信息银行内容"/);
  assert.match(html, /id="intake-generate-fit"[\s\S]*?value="strict"[\s\S]*?value="balanced" selected[\s\S]*?value="none"/);
  assert.match(html, /id="intake-generate-templates"[^>]*role="radiogroup"[^>]*aria-label="CV 模板预览"/);
  assert.equal((html.match(/name="cv-template"/g) || []).length, 4);
  ['classic', 'awesome', 'sidebar', 'banking'].forEach((templateId) => assert.match(html, new RegExp(`name="cv-template" value="${templateId}"`)));
  assert.match(html, /preview-classic[\s\S]*preview-awesome[\s\S]*preview-sidebar[\s\S]*preview-banking/);
  assert.match(html, /可用照片[\s\S]*无照片[\s\S]*可用照片[\s\S]*无照片/);
  assert.match(html, /id="intake-generate-progress"[^>]*aria-live="polite"[\s\S]*?role="progressbar"/);
  assert.doesNotMatch(html, /id="intake-generate-(?:items|job|parent|browse|select-all|select-none)"/);
  assert.match(app, /clipboardData\?\.files/);
  assert.match(app, /async function analyzeIntake/);
  assert.match(app, /async function commitIntake/);
  assert.match(app, /let intakeAnalyzedSource = null/);
  assert.match(app, /intakeAnalyzedSource = analysisSource/);
  assert.match(app, /const source = intakeAnalyzedSource \|\|/);
  assert.match(app, /itemIds:\s*\[\.\.\.intakeGenerationItemIds\]/);
  assert.match(app, /Accept:\s*'application\/x-ndjson'/);
  assert.match(app, /function updateIntakeGenerationProgress/);
  assert.match(app, /provider:\s*agentSettings\(\)/);
  assert.match(app, /templateId,/);
  assert.match(app, /cv-studio-generation-template/);
  assert.match(app, /function intakePhotoAttachmentIndexes/);
  assert.match(app, /设为个人照片/);
  assert.match(app, /material-photo-thumbnail/);
  assert.match(app, /intakeGenerationAbortController = new AbortController\(\)/);
  assert.match(app, /intakeGenerationAbortController\?\.abort\(\)/);
  assert.doesNotMatch(app, /intake-generate-(?:items|job|parent|browse|select-all|select-none)/);
  assert.match(app, /renderMaterialBank\(\);\s*await switchView\('bank-view'\)/);
  assert.match(app, /async function generateCvFromIntake/);
  assert.match(app, /async function extractPdfIntakeData/);
  assert.match(app, /getDocument\(\{[\s\S]*previewImages/s);
  assert.match(app, /function renderStructuredMaterial/);
  assert.doesNotMatch(app, /function materialStatusLabel|状态：可使用|bank-count-all/);
  assert.match(app, /function selectMaterialBankDensity/);
  assert.match(app, /cv-studio-material-bank-density/);
  assert.match(app, /cv-studio-material-bank-page-size/);
  assert.match(app, /const materialBankLists = \{[\s\S]*?job:[\s\S]*?personal:/);
  assert.doesNotMatch(app.match(/const materialBankLists = \{[\s\S]*?\};/)?.[0] || '', /all:/);
  assert.match(app, /function isMaterialCardExpanded/);
  assert.match(app, /function toggleMaterialCard/);
  assert.match(app, /toggle\.setAttribute\('aria-controls', detailsId\)/);
  assert.match(app, /toggle\.setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.match(app, /details\.setAttribute\('aria-hidden', String\(!expanded\)\)/);
  assert.match(app, /document\.querySelectorAll\('\.material-card\[data-material-id\]'\)/);
  assert.match(app, /function activateMaterialBankColumn/);
  assert.match(app, /const firstRects = canStretch[\s\S]*?column\.getBoundingClientRect\(\)/);
  assert.match(app, /const deltaX = firstCenter - lastCenter/);
  assert.match(app, /scaleX:\s*\[initialScaleX, 1\]/);
  assert.doesNotMatch(app, /scaleX:\s*\[initialScaleX,[^\]]*,\s*1\]/);
  assert.match(app, /canStretch = shouldAnimate[\s\S]*?!reduceMotion\.matches/);
  assert.match(app, /content\.hidden = !active/);
  assert.match(app, /visible\.slice\(start, start \+ intakeBankPageSize\)/);
  assert.match(app, /function selectMaterialBankPageSize/);
  assert.match(app, /let selectedMaterialIds = new Set\(\)/);
  assert.match(app, /function materialMatchesCurrentQuery/);
  assert.match(app, /function selectAllMaterialBankResults/);
  assert.match(app, /function invertMaterialBankResults/);
  assert.match(app, /async function deleteSelectedMaterialBankItems/);
  assert.match(app, /request\('\/api\/intake\/items\/delete'/);
  assert.match(app, /const rawBody = await response\.text\(\)/);
  assert.match(app, /error\.responseWasJson = responseWasJson/);
  assert.match(app, /后台仍是旧版本。请完全退出并重新启动 CV Studio/);
  assert.match(app, /const selected = selectedMaterialIds\.has\(item\.id\)[\s\S]*?checkbox\.checked = selected/);
  assert.match(app, /profile:\s*\['个人信息',\s*0\]/);
  assert.match(app, /PERSONAL_CATEGORY_META/);
  assert.match(app, /录入日期/);
  assert.match(app, /function updateIntakeCommitAvailability/);
  assert.match(app, /const unreadable = intakeSegments\.filter/);
  assert.match(html, /图片或扫描 PDF 若未被读懂，不能直接入库/);
  assert.match(server, /\/api\/intake\/classify/);
  assert.match(server, /\/api\/intake\/commit/);
  assert.match(server, /\/api\/intake\/generate/);
  assert.match(server, /application\/x-ndjson/);
  assert.match(server, /GENERATED_CV_DIR/);
  assert.match(server, /runCvGenerationAgent/);
  assert.match(server, /\/api\/intake\/items\/delete/);
  assert.match(server, /async function deleteIntakeItems/);
  assert.match(server, /hasMeaningfulExtractedContent/);
  assert.match(server, /const explicitPhotoIds/);
  assert.doesNotMatch(server, /selected\.flatMap\(\(item\) => item\.assetIds \|\| \[\]\)\.map\(\(id\) => assets\.get\(id\)\)\.find\(isRenderablePhoto\)/);
  assert.match(server, /templateId:\s*selectedTemplate\.id/);
  assert.match(runtime, /geekplux\/cv_resume/);
  assert.match(runtime, /CV_TEMPLATE_REGISTRY/);
  assert.match(runtime, /Awesome-CV/);
  assert.match(runtime, /AltaCV/);
  assert.match(runtime, /moderncv/);
  assert.match(runtime, /FandolSong-Regular/);
  assert.match(runtime, /itemPlacements/);
  assert.match(runtime, /extractionStatus/);
  assert.match(styles, /\.material-bank-columns[^}]*display:\s*flex/);
  assert.match(styles, /\.material-bank-column\.active[^}]*flex:\s*1 1 calc\(100% - 91px\)/);
  assert.match(styles, /\.material-bank-column:not\(\.active\) \.material-bank-column-header[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(styles, /\.material-bank-column-content\[hidden\][^}]*display:\s*none/);
  assert.match(styles, /\.material-bank-columns\.is-stretching \.material-bank-column[^}]*transform-origin:\s*50% 50%/);
  assert.match(styles, /\.material-card-checkbox[^}]*accent-color:\s*var\(--accent\)/);
  assert.match(styles, /\.cv-template-options[^}]*grid-template-columns:\s*repeat\(4/);
  assert.match(styles, /\.cv-template-option > input:checked \+ \.cv-template-card/);
  assert.match(styles, /\.material-photo-thumbnail/);
  assert.match(styles, /\.material-bank-columns\.is-stretching \.material-bank-column-content[^}]*opacity:\s*0/);
  assert.match(styles, /\.material-bank-list[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.material-card-toggle[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto/);
  assert.match(styles, /\.material-card[^}]*row-gap:\s*0/);
  assert.match(styles, /\.material-card-details[^}]*grid-template-rows:\s*1fr[^}]*transition:/);
  assert.match(styles, /\.material-card\.collapsed \.material-card-details[^}]*grid-template-rows:\s*0fr[^}]*border-top-width:\s*0/);
  assert.match(styles, /\.material-bank-pagination/);
  assert.match(styles, /\.material-bank-density button\.active/);
  assert.doesNotMatch(styles, /\.material-bank-list[^}]*repeat\(2/);
  assert.match(styles, /\.material-card-lifecycle/);
  assert.match(styles, /\.structured-material/);
  assert.match(styles, /\.intake-review-card\.unreadable/);
  assert.match(styles, /\.intake-generation-visual span[^}]*animation:\s*cv-generation-orbit/);
  assert.match(styles, /prefers-reduced-motion:[^}]*reduce[\s\S]*?\.intake-generation-visual span/);
});
