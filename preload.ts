import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  BootstrapPayload,
  BrowseSavePathPayload,
  DownloadEvent,
  MetadataPayload,
  StartDownloadPayload,
  YoutubeDownloaderAPI
} from "./src/types";

const api: YoutubeDownloaderAPI = {
  getBootstrap(): Promise<BootstrapPayload> {
    return ipcRenderer.invoke("app:get-bootstrap");
  },
  inspectUrl(url: string): Promise<MetadataPayload> {
    return ipcRenderer.invoke("downloads:inspect-url", url);
  },
  browseSavePath(payload: BrowseSavePathPayload): Promise<{ filePath: string } | null> {
    return ipcRenderer.invoke("downloads:browse-save-path", payload);
  },
  startDownload(payload: StartDownloadPayload): Promise<{ taskId: string }> {
    return ipcRenderer.invoke("downloads:start", payload);
  },
  cancelDownload(taskId: string): Promise<boolean> {
    return ipcRenderer.invoke("downloads:cancel", taskId);
  },
  openFolder(filePath: string): Promise<true> {
    return ipcRenderer.invoke("history:open-folder", filePath);
  },
  clearHistory(): Promise<true> {
    return ipcRenderer.invoke("history:clear");
  },
  quitApp(): Promise<true> {
    return ipcRenderer.invoke("app:quit");
  },
  onDownloadEvent(callback: (payload: DownloadEvent) => void): () => void {
    const listener = (_: IpcRendererEvent, payload: DownloadEvent) => callback(payload);
    ipcRenderer.on("downloads:event", listener);
    return () => ipcRenderer.removeListener("downloads:event", listener);
  }
};

contextBridge.exposeInMainWorld("youtubeDownloader", api);
