import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectApi, ProjectSnapshot } from '../shared/types';

const api: ProjectApi = {
  scanProjects: () => ipcRenderer.invoke('projects:scan'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  chooseRoot: () => ipcRenderer.invoke('settings:choose-root'),
  updateProjectFlags: (update) => ipcRenderer.invoke('projects:update-flags', update),
  updateUiState: (update) => ipcRenderer.invoke('settings:update-ui', update),
  openFolder: (relativePath) => ipcRenderer.invoke('projects:open-folder', relativePath),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onProjectsChanged: (callback) => {
    ipcRenderer.removeAllListeners('projects:changed');
    ipcRenderer.on('projects:changed', (_event, snapshot: ProjectSnapshot) => callback(snapshot));
  },
  removeProjectsChangedListener: () => ipcRenderer.removeAllListeners('projects:changed'),
  onWindowMaximizedChanged: (callback) => {
    ipcRenderer.removeAllListeners('window:maximized-changed');
    ipcRenderer.on('window:maximized-changed', (_event, maximized: boolean) => callback(maximized));
  },
  removeWindowMaximizedListener: () => ipcRenderer.removeAllListeners('window:maximized-changed'),
};

contextBridge.exposeInMainWorld('projectApi', api);
