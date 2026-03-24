import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, ChildProcess, SpawnOptions } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  sanitizeFilename,
  ensureExtension,
  formatFilterFor,
  buildFormatArguments,
  parseProgressLine,
  buildMetadataPayload
} from "./lib/utils";
import { getAutomationConfig, splitLines, buildProgressSnapshot } from "./lib/main-helpers";
import type {
  BrowseSavePathPayload,
  DownloadEvent,
  DownloadTask,
  HistoryEntry,
  StartDownloadPayload,
  ToolStatus
} from "./src/types";

const activeDownloads = new Map<string, DownloadTask>();

let mainWindow: BrowserWindow | null;
let historyFilePath: string;
let historyEntries: HistoryEntry[] = [];
let toolStatus: ToolStatus = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  ytDlpAvailable: false,
  ffmpegAvailable: false
};

function automationLog(message: string, details?: unknown): void {
  if (process.env.AUTOMATION_LOG !== "1") {
    return;
  }

  if (details === undefined) {
    console.log(`AUTOMATION_LOG ${message}`);
    return;
  }

  try {
    console.log(`AUTOMATION_LOG ${message} ${JSON.stringify(details)}`);
  } catch {
    console.log(`AUTOMATION_LOG ${message}`);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: "YouTube Downloader",
    backgroundColor: "#0c0c10",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    automationLog("window:did-finish-load");
  });

  mainWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    automationLog("window:did-fail-load", { errorCode, errorDescription });
  });

  mainWindow.webContents.on("render-process-gone", (_, details) => {
    automationLog("window:render-process-gone", details);
  });

  mainWindow.webContents.on("console-message", (_, level, message, line, sourceId) => {
    automationLog("window:console", { level, message, line, sourceId });
  });

  mainWindow.loadFile(path.join(__dirname, "src/index.html"));
}

async function ensureHistoryFile(): Promise<void> {
  historyFilePath = path.join(app.getPath("userData"), "download-history.json");
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });

  try {
    await fs.access(historyFilePath);
  } catch {
    await fs.writeFile(historyFilePath, "[]", "utf8");
  }
}

async function loadHistory(): Promise<void> {
  try {
    const contents = await fs.readFile(historyFilePath, "utf8");
    const parsed = JSON.parse(contents);
    historyEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    historyEntries = [];
  }
}

async function saveHistory(): Promise<void> {
  await fs.writeFile(historyFilePath, JSON.stringify(historyEntries, null, 2), "utf8");
}

async function prependHistory(entry: HistoryEntry): Promise<void> {
  historyEntries = [entry, ...historyEntries].slice(0, 200);
  await saveHistory();
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`));
    });
  });
}

async function locateBinary(binaryName: string): Promise<string> {
  const locator = process.platform === "win32" ? "where" : "which";

  try {
    const result = await runCommand(locator, [binaryName]);
    const firstPath = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstPath || binaryName;
  } catch {
    return binaryName;
  }
}

async function isBinaryAvailable(binaryPath: string, versionArg: string = "--version"): Promise<boolean> {
  try {
    await runCommand(binaryPath, [versionArg]);
    return true;
  } catch {
    return false;
  }
}

async function detectTools(): Promise<ToolStatus> {
  const ytDlpPath = await locateBinary("yt-dlp");
  const ffmpegPath = await locateBinary("ffmpeg");

  return {
    ytDlpPath,
    ffmpegPath,
    ytDlpAvailable: await isBinaryAvailable(ytDlpPath),
    ffmpegAvailable: await isBinaryAvailable(ffmpegPath, "-version")
  };
}

async function inspectUrl(url: string): Promise<ReturnType<typeof buildMetadataPayload>> {
  if (!toolStatus.ytDlpAvailable) {
    throw new Error("yt-dlp is not available in PATH.");
  }

  const result = await runCommand(toolStatus.ytDlpPath, [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    url
  ]);

  const info = JSON.parse(result.stdout);
  return buildMetadataPayload(url, info);
}

function sendDownloadEvent(payload: DownloadEvent): void {
  automationLog("event", payload);

  if (process.env.AUTO_QUIT === "1" && payload.type === "download-finished" && activeDownloads.size === 0) {
    setTimeout(() => {
      app.quit();
    }, 250);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("downloads:event", payload);
  }
}

async function recordHistory(task: DownloadTask, status: string, errorMessage: string = ""): Promise<void> {
  let fileSize = 0;

  if (status === "completed") {
    try {
      const stat = await fs.stat(task.outputPath || task.savePath);
      fileSize = stat.size;
    } catch {
      fileSize = 0;
    }
  }

  const entry: HistoryEntry = {
    id: task.id,
    title: task.title,
    url: task.url,
    format: task.format,
    quality: task.quality,
    savePath: task.savePath,
    outputPath: task.outputPath || task.savePath,
    status,
    errorMessage,
    fileSize,
    completedAt: new Date().toISOString()
  };

  await prependHistory(entry);
  sendDownloadEvent({ type: "history-updated", entry });
}

async function startDownload(downloadOptions: StartDownloadPayload): Promise<string> {
  if (!toolStatus.ytDlpAvailable) {
    throw new Error("yt-dlp is not available in PATH.");
  }

  if (!toolStatus.ffmpegAvailable) {
    throw new Error("ffmpeg is required for this downloader and is not available in PATH.");
  }

  const taskId = crypto.randomUUID();
  const formatArgs = buildFormatArguments(downloadOptions);
  const progressTemplate =
    "download:%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress._percent_str)s|%(progress.speed)s|%(progress.eta)s";
  const args = [
    "--newline",
    "--progress",
    "--progress-template",
    progressTemplate,
    "--no-warnings",
    "--ffmpeg-location",
    toolStatus.ffmpegPath,
    "--print",
    "after_move:__FINAL_PATH__:%(filepath)s",
    "--output",
    downloadOptions.savePath,
    ...formatArgs,
    downloadOptions.url
  ];

  const child = spawn(toolStatus.ytDlpPath, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  const task: DownloadTask = {
    id: taskId,
    title: downloadOptions.title,
    url: downloadOptions.url,
    format: downloadOptions.format,
    quality: downloadOptions.quality,
    savePath: downloadOptions.savePath,
    outputPath: downloadOptions.savePath,
    status: "starting",
    cancelled: false,
    settled: false,
    process: child
  };

  activeDownloads.set(taskId, task);
  sendDownloadEvent({
    type: "download-started",
    task: buildProgressSnapshot(task, {
      status: "starting",
      percent: 0,
      speed: 0,
      eta: 0,
      downloadedBytes: 0,
      totalBytes: 0
    })
  });

  let stdoutBuffer = "";
  let stderrBuffer = "";
  let lastErrorLine = "";

  const handleLine = (line: string): void => {
    if (line.startsWith("__FINAL_PATH__:")) {
      task.outputPath = line.replace("__FINAL_PATH__:", "").trim();
      return;
    }

    if (line.startsWith("ERROR:")) {
      lastErrorLine = line.replace("ERROR:", "").trim();
      return;
    }

    const parsed = parseProgressLine(line);
    if (!parsed) {
      return;
    }

    task.status = parsed.status === "finished" ? "processing" : "downloading";
    sendDownloadEvent({
      type: "download-progress",
      task: buildProgressSnapshot(task, parsed)
    });
  };

  child.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuffer = splitLines(stdoutBuffer, chunk.toString(), handleLine);
  });

  child.stderr!.on("data", (chunk: Buffer) => {
    stderrBuffer = splitLines(stderrBuffer, chunk.toString(), handleLine);
  });

  child.on("error", async (error: Error) => {
    if (task.settled) {
      return;
    }

    task.settled = true;
    activeDownloads.delete(taskId);
    task.status = task.cancelled ? "cancelled" : "failed";
    sendDownloadEvent({
      type: "download-finished",
      task: buildProgressSnapshot(task, {
        status: task.status,
        percent: 0,
        speed: 0,
        eta: 0,
        downloadedBytes: 0,
        totalBytes: 0
      }),
      errorMessage: error.message
    });
    await recordHistory(task, task.status, error.message);
  });

  child.on("close", async (code: number | null) => {
    if (task.settled) {
      return;
    }

    task.settled = true;
    activeDownloads.delete(taskId);

    const finalStatus = task.cancelled ? "cancelled" : code === 0 ? "completed" : "failed";
    task.status = finalStatus;
    const errorMessage = finalStatus === "failed" ? lastErrorLine || `Download failed with exit code ${code}` : "";

    sendDownloadEvent({
      type: "download-finished",
      task: buildProgressSnapshot(task, {
        status: finalStatus,
        percent: finalStatus === "completed" ? 100 : 0,
        speed: 0,
        eta: 0,
        downloadedBytes: 0,
        totalBytes: 0
      }),
      errorMessage
    });

    await recordHistory(task, finalStatus, errorMessage);
  });

  return taskId;
}

function cancelDownload(taskId: string): boolean {
  const task = activeDownloads.get(taskId);

  if (!task) {
    return false;
  }

  task.cancelled = true;
  task.status = "cancelled";
  task.process.kill("SIGINT");
  return true;
}

ipcMain.handle("app:get-bootstrap", async () => {
  return {
    tools: toolStatus,
    history: historyEntries,
    automation: getAutomationConfig()
  };
});

ipcMain.handle("downloads:inspect-url", async (_, url: string) => {
  automationLog("inspect-url:start", { url });
  const result = await inspectUrl(url);
  automationLog("inspect-url:success", { title: result.title, uploader: result.uploader });
  return result;
});

ipcMain.handle("downloads:browse-save-path", async (_, payload: BrowseSavePathPayload) => {
  const extension = payload.format || "mp4";
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Choose where to save the download",
    defaultPath: path.join(app.getPath("downloads"), `${sanitizeFilename(payload.suggestedFilename)}.${extension}`),
    buttonLabel: "Save Here",
    filters: [formatFilterFor(extension), { name: "All Files", extensions: ["*"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return {
    filePath: ensureExtension(result.filePath, extension)
  };
});

ipcMain.handle("downloads:start", async (_, payload: StartDownloadPayload) => {
  return {
    taskId: await startDownload(payload)
  };
});

ipcMain.handle("downloads:cancel", async (_, taskId: string) => {
  return cancelDownload(taskId);
});

ipcMain.handle("history:open-folder", async (_, filePath: string) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("history:clear", async () => {
  historyEntries = [];
  await saveHistory();
  return true;
});

ipcMain.handle("app:quit", async () => {
  setTimeout(() => {
    app.quit();
  }, 50);
  return true;
});

app.whenReady().then(async () => {
  historyFilePath = path.join(app.getPath("userData"), "download-history.json");
  await ensureHistoryFile();
  await loadHistory();
  toolStatus = await detectTools();
  automationLog("app-ready", {
    automation: getAutomationConfig(),
    tools: toolStatus
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
