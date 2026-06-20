"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const predictionRepoDir = process.env.AI_MATERIALS_PLATFORM_DIR || path.resolve(rootDir, "..", "ai-materials-discovery-platform");
let backendProcess = null;
let mainWindow = null;

function startBackend() {
  const pythonCommand = process.platform === "win32" ? "python" : "python3";
  backendProcess = spawn(pythonCommand, [path.join(rootDir, "backend", "simulation_server.py")], {
    cwd: rootDir,
    stdio: "ignore",
    windowsHide: true
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    backgroundColor: "#0B1020",
    title: "AI 합금 디지털 트윈 시뮬레이션",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on("did-finish-load", () => {
    console.log("[main] did-finish-load → showing window");
    win.show();
    win.focus();
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[main] did-fail-load:", code, desc, url);
    win.show();
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[main] render-process-gone:", details.reason);
  });

  win.webContents.on("console-message", (_e, level, msg) => {
    if (level >= 2) console.error("[renderer]", msg);
  });

  setTimeout(() => {
    if (!win.isVisible()) { console.log("[main] fallback show"); win.show(); win.focus(); }
  }, 5000);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(rootDir, "dist", "index.html");
    console.log("[main] loading:", indexPath);
    win.loadFile(indexPath);
  }
  mainWindow = win;
  win.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});

ipcMain.handle("app:getBackendUrl", () => "http://127.0.0.1:8765");

ipcMain.handle("app:close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle("app:openPrediction", () => {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const child = spawn(pythonCmd, ["main.py"], {
    cwd: predictionRepoDir,
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
});
