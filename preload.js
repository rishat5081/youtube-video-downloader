const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("youtubeDownloader", {
  getBootstrap() {
    return ipcRenderer.invoke("app:get-bootstrap");
  },
  inspectUrl(url) {
    return ipcRenderer.invoke("downloads:inspect-url", url);
  },
  browseSavePath(payload) {
    return ipcRenderer.invoke("downloads:browse-save-path", payload);
  },
  startDownload(payload) {
    return ipcRenderer.invoke("downloads:start", payload);
  },
  cancelDownload(taskId) {
    return ipcRenderer.invoke("downloads:cancel", taskId);
  },
  openFolder(filePath) {
    return ipcRenderer.invoke("history:open-folder", filePath);
  },
  clearHistory() {
    return ipcRenderer.invoke("history:clear");
  },
  onDownloadEvent(callback) {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on("downloads:event", listener);
    return () => ipcRenderer.removeListener("downloads:event", listener);
  }
});
