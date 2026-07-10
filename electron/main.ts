import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import type {
  ActionResult,
  ProjectFlagUpdate,
  ProjectSnapshot,
  UiStateUpdate,
} from '../shared/types';
import { ConfigStore } from './config-store';
import { scanProjectRoot } from './scanner';

app.setName('项目总览');

let mainWindow: BrowserWindow | null = null;
let configStore: ConfigStore;
let watchers: FSWatcher[] = [];
let rescanTimer: NodeJS.Timeout | null = null;
let latestSnapshot: ProjectSnapshot | null = null;

function emitMaximizedState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  }
}

function closeWatchers(): void {
  for (const watcher of watchers) watcher.close();
  watchers = [];
}

function scheduleScan(): void {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    void performScan(true);
  }, 450);
}

function installWatchers(paths: string[]): void {
  closeWatchers();
  for (const watchPath of new Set(paths)) {
    try {
      const watcher = watch(watchPath, { persistent: false }, scheduleScan);
      watcher.on('error', scheduleScan);
      watchers.push(watcher);
    } catch {
      // A transient missing folder is reported by the next scan.
    }
  }
}

async function performScan(broadcast = false): Promise<ProjectSnapshot> {
  const settings = configStore.get();
  const result = await scanProjectRoot(settings.rootPath, settings);
  installWatchers(result.watchPaths);
  result.snapshot.watchActive = watchers.length > 0;
  latestSnapshot = result.snapshot;
  if (broadcast && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projects:changed', latestSnapshot);
  }
  return latestSnapshot;
}

function resolveInsideRoot(relativePath: string): string | null {
  const rootPath = path.resolve(configStore.get().rootPath);
  const targetPath = path.resolve(rootPath, relativePath);
  const relative = path.relative(rootPath, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return targetPath;
}

async function openProjectFolder(relativePath: string): Promise<ActionResult> {
  const targetPath = resolveInsideRoot(relativePath);
  if (!targetPath) return { ok: false, error: '项目路径不在当前根目录中。' };

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) return { ok: false, error: '项目文件夹已经不存在。' };
    const shellError = await shell.openPath(targetPath);
    if (shellError) return { ok: false, error: shellError };
    await configStore.addRecent(relativePath);
    await performScan(true);
    return { ok: true };
  } catch {
    return { ok: false, error: '项目文件夹已经移动、改名或删除。' };
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('projects:scan', () => performScan());
  ipcMain.handle('settings:get', () => configStore.get());
  ipcMain.handle('settings:choose-root', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择项目根目录',
      defaultPath: configStore.get().rootPath,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await configStore.setRootPath(result.filePaths[0]);
    return performScan(true);
  });
  ipcMain.handle('projects:update-flags', async (_event, update: ProjectFlagUpdate) => {
    await configStore.updateFlags(update);
    return performScan(true);
  });
  ipcMain.handle('settings:update-ui', (_event, update: UiStateUpdate) =>
    configStore.updateUiState(update),
  );
  ipcMain.handle('projects:open-folder', (_event, relativePath: string) =>
    openProjectFolder(relativePath),
  );
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#f4f3ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.on('maximize', emitMaximizedState);
  mainWindow.on('unmaximize', emitMaximizedState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void mainWindow.loadURL(developmentUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
}

app.whenReady().then(async () => {
  configStore = new ConfigStore(
    path.join(app.getPath('userData'), 'config.json'),
    app.getPath('documents'),
  );
  registerIpcHandlers();
  createWindow();
  await performScan();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', closeWatchers);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
