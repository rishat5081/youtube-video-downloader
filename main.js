const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
  sanitizeFilename,
  ensureExtension,
  formatFilterFor,
  buildFormatArguments,
  parseProgressLine,
  buildMetadataPayload
} = require("./lib/utils");

const activeDownloads = new Map();

let mainWindow;
let historyFilePath;
let historyEntries = [];
let toolStatus = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  ytDlpAvailable: false,
  ffmpegAvailable: false
};

function getAutomationConfig() {
  const autoUrl = process.env.AUTO_URL || "";
  const autoSavePath = process.env.AUTO_SAVE_PATH || "";

  if (!autoUrl || !autoSavePath) {
    return null;
  }

  return {
    url: autoUrl,
    savePath: autoSavePath,
    format: process.env.AUTO_FORMAT || "mp4",
    quality: process.env.AUTO_QUALITY || "best",
    autoStart: process.env.AUTO_START === "1"
  };
}

function createWindow() {
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

  mainWindow.loadFile(path.join(__dirname, "src/index.html"));
}

async function ensureHistoryFile() {
  historyFilePath = path.join(app.getPath("userData"), "download-history.json");
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });

  try {
    await fs.access(historyFilePath);
  } catch {
    await fs.writeFile(historyFilePath, "[]", "utf8");
  }
}

async function loadHistory() {
  try {
    const contents = await fs.readFile(historyFilePath, "utf8");
    const parsed = JSON.parse(contents);
    historyEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    historyEntries = [];
  }
}

async function saveHistory() {
  await fs.writeFile(historyFilePath, JSON.stringify(historyEntries, null, 2), "utf8");
}

async function prependHistory(entry) {
  historyEntries = [entry, ...historyEntries].slice(0, 200);
  await saveHistory();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
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

async function locateBinary(binaryName) {
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

async function isBinaryAvailable(binaryPath, versionArg = "--version") {
  try {
    await runCommand(binaryPath, [versionArg]);
    return true;
  } catch {
    return false;
  }
}

async function detectTools() {
  const ytDlpPath = await locateBinary("yt-dlp");
  const ffmpegPath = await locateBinary("ffmpeg");

  return {
    ytDlpPath,
    ffmpegPath,
    ytDlpAvailable: await isBinaryAvailable(ytDlpPath),
    ffmpegAvailable: await isBinaryAvailable(ffmpegPath, "-version")
  };
}

async function inspectUrl(url) {
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

function splitLines(buffer, incomingChunk, onLine) {
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

function sendDownloadEvent(payload) {
  if (process.env.AUTOMATION_LOG === "1") {
    try {
      console.log(`AUTOMATION_EVENT ${JSON.stringify(payload)}`);
    } catch {
      console.log("AUTOMATION_EVENT serialization-error");
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("downloads:event", payload);
  }
}

function buildProgressSnapshot(task, progress) {
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

async function recordHistory(task, status, errorMessage = "") {
  let fileSize = 0;

  if (status === "completed") {
    try {
      const stat = await fs.stat(task.outputPath || task.savePath);
      fileSize = stat.size;
    } catch {
      fileSize = 0;
    }
  }

  const entry = {
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

async function startDownload(downloadOptions) {
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

  const task = {
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

  const handleLine = (line) => {
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

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = splitLines(stdoutBuffer, chunk.toString(), handleLine);
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer = splitLines(stderrBuffer, chunk.toString(), handleLine);
  });

  child.on("error", async (error) => {
    if (task.settled) {
      return;
    }

    task.settled = true;
    activeDownloads.delete(taskId);
    task.status = task.cancelled ? "cancelled" : "failed";
    sendDownloadEvent({
      type: "download-finished",
      task: buildProgressSnapshot(task, {
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

  child.on("close", async (code) => {
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

function cancelDownload(taskId) {
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

ipcMain.handle("downloads:inspect-url", async (_, url) => {
  return inspectUrl(url);
});

ipcMain.handle("downloads:browse-save-path", async (_, payload) => {
  const extension = payload.format || "mp4";
  const result = await dialog.showSaveDialog(mainWindow, {
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

ipcMain.handle("downloads:start", async (_, payload) => {
  return {
    taskId: await startDownload(payload)
  };
});

ipcMain.handle("downloads:cancel", async (_, taskId) => {
  return cancelDownload(taskId);
});

ipcMain.handle("history:open-folder", async (_, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("history:clear", async () => {
  historyEntries = [];
  await saveHistory();
  return true;
});

app.whenReady().then(async () => {
  historyFilePath = path.join(app.getPath("userData"), "download-history.json");
  await ensureHistoryFile();
  await loadHistory();
  toolStatus = await detectTools();
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
