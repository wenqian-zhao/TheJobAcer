const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cvStudioDesktop', Object.freeze({
  platform: 'macos',
  selectProjectFolder: () => ipcRenderer.invoke('cv-studio:select-project-folder'),
}));
