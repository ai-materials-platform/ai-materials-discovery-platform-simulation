const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getBackendUrl: () => ipcRenderer.invoke("app:getBackendUrl"),
  savePDF: (data) => ipcRenderer.invoke("pdf:save", data),
});
