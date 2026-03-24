import type {
  AutomationConfig,
  DownloadTask,
  ProgressData,
  ProgressSnapshot,
  StartDownloadPayload
} from "../src/types";

export function getAutomationConfig(): AutomationConfig | null {
  const autoQueue = process.env.AUTO_QUEUE || "";
  const autoUrl = process.env.AUTO_URL || "";
  const autoSavePath = process.env.AUTO_SAVE_PATH || "";
  const autoQuit = process.env.AUTO_QUIT === "1";
  const clearHistory = process.env.AUTO_CLEAR_HISTORY === "1";
  const openFirstHistory = process.env.AUTO_OPEN_HISTORY_FIRST === "1";
  const cancelAfterMs = Number(process.env.AUTO_CANCEL_AFTER_MS || 0) || undefined;

  let queueItems: StartDownloadPayload[] | undefined;
  if (autoQueue) {
    try {
      const parsed = JSON.parse(autoQueue) as unknown;
      if (Array.isArray(parsed)) {
        queueItems = parsed.filter(
          (item): item is StartDownloadPayload =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as StartDownloadPayload).url === "string" &&
            typeof (item as StartDownloadPayload).title === "string" &&
            typeof (item as StartDownloadPayload).format === "string" &&
            typeof (item as StartDownloadPayload).quality === "string" &&
            typeof (item as StartDownloadPayload).savePath === "string"
        );
      }
    } catch {
      queueItems = undefined;
    }
  }

  if ((!autoUrl || !autoSavePath) && (!queueItems || queueItems.length === 0) && !clearHistory && !openFirstHistory) {
    return null;
  }

  return {
    url: autoUrl,
    savePath: autoSavePath,
    format: process.env.AUTO_FORMAT || "mp4",
    quality: process.env.AUTO_QUALITY || "best",
    autoStart: process.env.AUTO_START === "1",
    autoQuit,
    cancelAfterMs,
    clearHistory,
    openFirstHistory,
    queueItems
  };
}

export function splitLines(buffer: string, incomingChunk: string, onLine: (line: string) => void): string {
  const merged = buffer + incomingChunk;
  const lines = merged.split(/\r?\n/);
  const remainder = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      onLine(trimmed);
    }
  }

  return remainder;
}

export function buildProgressSnapshot(task: DownloadTask, progress: ProgressData): ProgressSnapshot {
  return {
    id: task.id,
    title: task.title,
    url: task.url,
    format: task.format,
    quality: task.quality,
    savePath: task.savePath,
    outputPath: task.outputPath || task.savePath,
    status: task.status,
    percent: progress.percent,
    speed: progress.speed,
    eta: progress.eta,
    downloadedBytes: progress.downloadedBytes,
    totalBytes: progress.totalBytes
  };
}
