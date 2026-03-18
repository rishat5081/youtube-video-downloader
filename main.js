const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

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
    backgroundColor: "#0d1117",
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

function sanitizeFilename(value) {
  return (
    (value || "download")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "download"
  );
}

function ensureExtension(filePath, extension) {
  if (path.extname(filePath).toLowerCase() === `.${extension}`) {
    return filePath;
  }

  return `${filePath.replace(/\.+$/, "")}.${extension}`;
}

function formatFilterFor(extension) {
  return {
    name: `${extension.toUpperCase()} file`,
    extensions: [extension]
  };
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

function toUniqueSortedNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => b - a);
}

function extractVideoQualities(formats, preferredExt) {
  const matching = formats.filter((format) => {
    return (
      format.vcodec &&
      format.vcodec !== "none" &&
      Number.isFinite(format.height) &&
      (!preferredExt || format.ext === preferredExt)
    );
  });

  const heights = toUniqueSortedNumbers(matching.map((format) => format.height));
  const list = heights.map((height) => ({
    value: String(height),
    label: `${height}p`
  }));

  return [{ value: "best", label: "Best available" }, ...list];
}

function extractAudioQualities(formats) {
  const bitrates = toUniqueSortedNumbers(formats.map((format) => Number(format.abr)));
  const normalized = bitrates.filter((bitrate) => bitrate >= 64).slice(0, 6);

  if (normalized.length === 0) {
    normalized.push(320, 256, 192, 128);
  }

  return [
    { value: "best", label: "Best audio" },
    ...normalized.map((bitrate) => ({
      value: String(Math.round(bitrate)),
      label: `${Math.round(bitrate)} kbps`
    }))
  ];
}

function buildMetadataPayload(url, info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const safeTitle = sanitizeFilename(info.title || "download");

  return {
    title: info.title || "Untitled video",
    uploader: info.uploader || info.channel || "Unknown creator",
    duration: Number(info.duration) || 0,
    thumbnail: info.thumbnail || "",
    webpageUrl: info.webpage_url || url,
    suggestedFilename: safeTitle,
    availableVideoQualities: {
      mp4: extractVideoQualities(formats, "mp4"),
      webm: extractVideoQualities(formats, "webm")
    },
    availableAudioQualities: extractAudioQualities(formats)
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

function buildFormatArguments({ format, quality }) {
  if (format === "mp3" || format === "wav") {
    const args = ["--format", "bestaudio/best", "--extract-audio", "--audio-format", format];

    if (quality !== "best") {
      args.push("--audio-quality", quality);
    } else {
      args.push("--audio-quality", "0");
    }

    return args;
  }

  const extension = format === "webm" ? "webm" : "mp4";
  const audioExt = extension === "mp4" ? "m4a" : "webm";

  if (quality === "best") {
    return [
      "--format",
      `bv*[ext=${extension}]+ba[ext=${audioExt}]/b[ext=${extension}]/best`,
      "--merge-output-format",
      extension
    ];
  }

  return [
    "--format",
    `bv*[ext=${extension}][height<=?${quality}]+ba[ext=${audioExt}]/b[ext=${extension}][height<=?${quality}]/best[height<=?${quality}]`,
    "--merge-output-format",
    extension
  ];
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

function parseProgressLine(line) {
  if (!line.startsWith("download:")) {
    return null;
  }

  const parts = line.replace("download:", "").split("|");

  if (parts.length < 7) {
    return null;
  }

  const percent = Number(parts[4].replace("%", "").trim()) || 0;
  const downloadedBytes = Number(parts[1]) || 0;
  const totalBytes = Number(parts[2]) || Number(parts[3]) || 0;
  const speed = Number(parts[5]) || 0;
  const eta = Number(parts[6]) || 0;

  return {
    status: parts[0].trim(),
    percent,
    downloadedBytes,
    totalBytes,
    speed,
    eta
  };
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
