const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow;
let localServer;

if (process.env.CV_STUDIO_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.CV_STUDIO_USER_DATA_DIR));
}

function applicationRoot() {
  return app.getAppPath();
}

async function ensureWorkspace() {
  const workspace = path.join(app.getPath('userData'), 'workspace');
  try {
    await fs.access(workspace);
  } catch {
    const seed = app.isPackaged
      ? path.join(process.resourcesPath, 'default-workspace')
      : path.join(applicationRoot(), 'workspace');
    await fs.cp(seed, workspace, {
      recursive: true,
      errorOnExist: false,
      filter(source) {
        const name = path.basename(source);
        return name !== '.cvstudio.json'
          && !/\.(?:aux|fdb_latexmk|fls|log|out|pdf|synctex\.gz)$/i.test(name);
      },
    });
  }
  return workspace;
}

function configureServicePaths(workspace) {
  process.env.CV_STUDIO_ROOT_DIR = applicationRoot();
  process.env.CV_STUDIO_WORKSPACE_DIR = workspace;
  process.env.CV_STUDIO_TECTONIC_ROOT = app.isPackaged
    ? path.join(process.resourcesPath, 'vendor', 'tectonic')
    : path.join(applicationRoot(), 'vendor', 'tectonic');
}

function installApplicationMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '显示', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('cv-studio:select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 LaTeX 简历项目',
    buttonLabel: '打开项目',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

async function createWindow() {
  if (!localServer) {
    const workspace = await ensureWorkspace();
    configureServicePaths(workspace);
    const { start } = require('../server');
    localServer = await start({ port: 0 });
  }

  mainWindow = new BrowserWindow({
    title: 'CV Studio',
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f2ee',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(localServer.url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localServer.url)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  await mainWindow.loadURL(`${localServer.url}/?desktop=macos`);

  if (process.env.CV_STUDIO_CAPTURE_PATH) {
    const captureView = process.env.CV_STUDIO_CAPTURE_VIEW || 'landing';
    console.log(`Capture view: ${captureView}`);
    // Wait for project hydration and event binding, then let the entrance
    // motion reach a stable frame before taking visual-regression captures.
    await mainWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = setInterval(() => {
        if (document.body.dataset.cvStudioReady === 'true') {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - startedAt > 10000) {
          clearInterval(poll);
          reject(new Error('Renderer did not become ready for capture.'));
        }
      }, 50);
    })`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    if (process.env.CV_STUDIO_CAPTURE_THEME === 'dark') {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#landing-theme-toggle')?.click()");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (captureView !== 'landing') {
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        document.querySelector('#hero-enter')?.click();
        const startedAt = Date.now();
        const poll = setInterval(() => {
          if (!document.querySelector('#app-view')?.hidden) {
            clearInterval(poll);
            resolve();
          } else if (Date.now() - startedAt > 5000) {
            clearInterval(poll);
            reject(new Error('Workspace did not become visible for capture.'));
          }
        }, 50);
      })`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (captureView === 'agent') {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#pixel-agent-launcher')?.click()");
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (captureView === 'interview') {
      await mainWindow.webContents.executeJavaScript("document.querySelector('[data-view=\"interview-view\"]')?.click()");
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (['preview', 'pdf-review'].includes(captureView)) {
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        document.querySelector('#compile-button')?.click();
        const startedAt = Date.now();
        const poll = setInterval(() => {
          if (!document.querySelector('#preview')?.hidden) {
            clearInterval(poll);
            resolve();
          } else if (Date.now() - startedAt > 15000) {
            clearInterval(poll);
            reject(new Error('PDF preview did not become visible for capture.'));
          }
        }, 100);
      })`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (captureView === 'pdf-review') {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#pdf-review-button')?.click(); document.querySelector('#pdf-use-page')?.click()");
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    const captureState = await mainWindow.webContents.executeJavaScript(`({
      landingHidden: document.querySelector('#landing-view')?.hidden,
      appHidden: document.querySelector('#app-view')?.hidden,
      landingOpacity: getComputedStyle(document.querySelector('#landing-view')).opacity,
      appOpacity: getComputedStyle(document.querySelector('#app-view')).opacity,
      editorTransform: getComputedStyle(document.querySelector('#editor-view')).transform,
      workspaceTransform: getComputedStyle(document.querySelector('#workspace')).transform,
      agentRect: document.querySelector('#agent-pane')?.getBoundingClientRect().toJSON(),
      pdfHidden: document.querySelector('#preview')?.hidden,
      pdfCanvas: {
        width: document.querySelector('#pdf-canvas')?.width || 0,
        height: document.querySelector('#pdf-canvas')?.height || 0,
      },
      pdfPages: document.querySelector('#pdf-page-count')?.textContent,
    })`);
    console.log(`Capture state: ${JSON.stringify(captureState)}`);
    const screenshot = await mainWindow.webContents.capturePage();
    await fs.writeFile(path.resolve(process.env.CV_STUDIO_CAPTURE_PATH), screenshot.toPNG());
    app.quit();
  }
}

app.whenReady().then(async () => {
  installApplicationMenu();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  localServer?.server.close();
});
