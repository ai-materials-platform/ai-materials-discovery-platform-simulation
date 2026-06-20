const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getBackendUrl:   () => ipcRenderer.invoke("app:getBackendUrl"),
  close:           () => ipcRenderer.invoke("app:close"),
  openPrediction:  () => ipcRenderer.invoke("app:openPrediction"),
});
