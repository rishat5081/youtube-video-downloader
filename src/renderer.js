const state = {
  tools: null,
  metadata: null,
  activeDownloads: new Map(),
  pendingDownloads: [],
  history: [],
  currentSavePath: "",
  automation: null
};

const refs = {};

/* ---- Helpers ---- */

function getDurationLabel(seconds) {
  if (!seconds) return "0:00";
  const total = Number(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s]
    .filter((v, i) => v > 0 || i > 0)
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

function getFileSizeLabel(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getSpeedLabel(bps) {
  return bps ? `${getFileSizeLabel(bps)}/s` : "---";
}

function getEtaLabel(seconds) {
  if (!seconds && seconds !== 0) return "---";
  if (seconds <= 0) return "finishing";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ---- Flash ---- */

function setFlashMessage(message, type = "success") {
  refs.flashMessage.textContent = message;
  refs.flashMessage.className = `flash ${type}`;
}

function clearFlashMessage() {
  refs.flashMessage.textContent = "";
  refs.flashMessage.className = "flash hidden";
}

/* ---- Tool status ---- */

function renderToolStatus() {
  if (!state.tools) return;
  refs.ytdlpDot.className = `status-dot ${state.tools.ytDlpAvailable ? "available" : "unavailable"}`;
  refs.ffmpegDot.className = `status-dot ${state.tools.ffmpegAvailable ? "available" : "unavailable"}`;
}

/* ---- Status bar ---- */

function updateStatusBar() {
  refs.statusBarDownloads.textContent = `${state.activeDownloads.size} active`;
  refs.statusBarQueue.textContent = `Queue: ${state.pendingDownloads.length}`;
  refs.statusBarHistory.textContent = `History: ${state.history.length}`;
}

/* ---- Sidebar history ---- */

function statusIcon(status) {
  if (status === "completed") {
    return '<svg class="sidebar-item-icon completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }
  if (status === "failed") {
    return '<svg class="sidebar-item-icon failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }
  return '<svg class="sidebar-item-icon cancelled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
}

function renderSidebarHistory() {
  if (state.history.length === 0) {
    refs.sidebarHistory.innerHTML = '<div class="sidebar-empty">Downloads will appear here</div>';
    return;
  }
  refs.sidebarHistory.innerHTML = state.history
    .map(
      (e) => `
    <div class="sidebar-item" data-history-path="${escapeHtml(e.outputPath || e.savePath)}" data-history-status="${escapeHtml(e.status)}">
      ${statusIcon(e.status)}
      <div class="sidebar-item-content">
        <div class="sidebar-item-title">${escapeHtml(e.title)}</div>
        <div class="sidebar-item-meta">${escapeHtml(e.format.toUpperCase())} · ${escapeHtml(getFileSizeLabel(e.fileSize || 0))}</div>
      </div>
      <span class="sidebar-item-time">${escapeHtml(timeAgo(e.completedAt))}</span>
    </div>`
    )
    .join("");
}

/* ---- Video card (metadata + config) ---- */

function renderVideoCard() {
  if (!state.metadata) {
    refs.videoCard.style.display = "none";
    refs.emptyState.style.display = "";
    return;
  }

  refs.emptyState.style.display = "none";
  refs.videoCard.style.display = "";

  const meta = state.metadata;
  refs.videoThumb.innerHTML = meta.thumbnail
    ? `<img src="${escapeHtml(meta.thumbnail)}" alt="${escapeHtml(meta.title)}" />`
    : "";
  refs.videoTitle.textContent = meta.title;
  refs.videoUploader.textContent = meta.uploader;
  refs.videoDuration.textContent = getDurationLabel(meta.duration);
}

/* ---- Quality options ---- */

function getQualityOptionsForFormat(format) {
  if (!state.metadata) return [{ value: "best", label: "Best available" }];
  if (format === "mp3" || format === "wav") return state.metadata.availableAudioQualities;
  const options = state.metadata.availableVideoQualities[format] || [];
  return options.length > 0 ? options : [{ value: "best", label: "Best available" }];
}

function renderQualityOptions() {
  const options = getQualityOptionsForFormat(refs.formatSelect.value);
  refs.qualitySelect.innerHTML = options
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join("");
}

/* ---- Active downloads ---- */

function renderActiveDownloads() {
  const tasks = [...state.activeDownloads.values()];
  if (tasks.length === 0) {
    refs.activeSection.style.display = "none";
    updateStatusBar();
    return;
  }

  refs.activeSection.style.display = "";
  refs.activeDownloads.innerHTML = tasks
    .map(
      (t) => `
    <div class="dl-card">
      <div class="dl-card-header">
        <div class="dl-card-title">${escapeHtml(t.title)}</div>
        <div class="dl-card-actions">
          <span class="tag tag-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
          <button class="cancel-btn" type="button" data-cancel-id="${escapeHtml(t.id)}">Cancel</button>
        </div>
      </div>
      <div class="dl-card-subtitle">${escapeHtml(t.format.toUpperCase())} · ${escapeHtml(t.quality === "best" ? "Best" : t.quality)}</div>
      <div class="progress-track"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, t.percent || 0))}%"></div></div>
      <div class="progress-stats">
        <span><span class="progress-val">${Math.round(t.percent || 0)}%</span></span>
        <span><span class="progress-val">${escapeHtml(getSpeedLabel(t.speed))}</span></span>
        <span>ETA <span class="progress-val">${escapeHtml(getEtaLabel(t.eta))}</span></span>
        <span><span class="progress-val">${escapeHtml(getFileSizeLabel(t.downloadedBytes || 0))}</span> / ${escapeHtml(getFileSizeLabel(t.totalBytes || 0))}</span>
      </div>
    </div>`
    )
    .join("");
  updateStatusBar();
}

/* ---- Queue ---- */

function renderPendingDownloads() {
  if (state.pendingDownloads.length === 0) {
    refs.queueSection.style.display = "none";
    refs.startAllQueuedButton.disabled = true;
    updateStatusBar();
    return;
  }

  refs.queueSection.style.display = "";
  refs.startAllQueuedButton.disabled = false;
  refs.queuedDownloads.innerHTML = state.pendingDownloads
    .map(
      (e) => `
    <div class="q-card">
      <div class="q-card-info">
        <div class="q-card-title">${escapeHtml(e.title)}</div>
        <div class="q-card-meta">${escapeHtml(e.format.toUpperCase())} · ${escapeHtml(e.quality === "best" ? "Best" : e.quality)}</div>
      </div>
      <div class="q-card-actions">
        <button class="q-btn q-btn-start" data-start-queued="${escapeHtml(e.id)}">Start</button>
        <button class="q-btn" data-remove-queued="${escapeHtml(e.id)}">Remove</button>
      </div>
    </div>`
    )
    .join("");
  updateStatusBar();
}

function renderHistory() {
  renderSidebarHistory();
  updateStatusBar();
}

function syncDownloadButton() {
  refs.downloadButton.disabled = !state.metadata;
}

function applyBootstrap(payload) {
  state.tools = payload.tools;
  state.history = payload.history || [];
  state.automation = payload.automation || null;
  renderToolStatus();
  renderHistory();
}

/* ---- Automation ---- */

async function runAutomationIfConfigured() {
  if (!state.automation || !state.automation.url || !state.automation.savePath) return;
  refs.urlInput.value = state.automation.url;
  refs.formatSelect.value = state.automation.format;
  renderQualityOptions();
  try {
    const metadata = await window.youtubeDownloader.inspectUrl(state.automation.url);
    state.metadata = metadata;
    renderVideoCard();
    renderQualityOptions();
    syncDownloadButton();
    if ([...refs.qualitySelect.options].some((o) => o.value === state.automation.quality)) {
      refs.qualitySelect.value = state.automation.quality;
    }
    state.currentSavePath = state.automation.savePath;
    refs.savePathInput.value = state.automation.savePath;
    setFlashMessage("Automation loaded.", "success");
    if (!state.automation.autoStart) return;
    refs.downloadButton.disabled = true;
    await window.youtubeDownloader.startDownload({
      url: state.automation.url,
      title: state.metadata.title,
      format: refs.formatSelect.value,
      quality: refs.qualitySelect.value,
      savePath: state.currentSavePath
    });
    setFlashMessage("Automation started download.", "success");
    state.currentSavePath = "";
    refs.savePathInput.value = "";
  } catch (error) {
    setFlashMessage(error.message || "Automation failed.", "error");
  } finally {
    refs.downloadButton.disabled = false;
  }
}

/* ---- Event handlers ---- */

async function handleAnalyze(event) {
  event.preventDefault();
  clearFlashMessage();
  const url = refs.urlInput.value.trim();
  if (!url) {
    setFlashMessage("Paste a YouTube URL first.", "error");
    return;
  }

  refs.analyzeButton.disabled = true;
  refs.analyzeButton.textContent = "Analyzing...";

  try {
    const metadata = await window.youtubeDownloader.inspectUrl(url);
    state.metadata = metadata;
    state.currentSavePath = "";
    refs.savePathInput.value = "";
    renderVideoCard();
    renderQualityOptions();
    syncDownloadButton();
    clearFlashMessage();
  } catch (error) {
    setFlashMessage(error.message || "Could not analyze this link.", "error");
  } finally {
    refs.analyzeButton.disabled = false;
    refs.analyzeButton.textContent = "Analyze";
  }
}

async function chooseSavePath() {
  if (!state.metadata) {
    setFlashMessage("Analyze a video first.", "error");
    return;
  }
  const response = await window.youtubeDownloader.browseSavePath({
    suggestedFilename: state.metadata.suggestedFilename,
    format: refs.formatSelect.value
  });
  if (!response) return;
  state.currentSavePath = response.filePath;
  refs.savePathInput.value = response.filePath;
}

async function ensureConfiguredSavePath() {
  if (!state.currentSavePath) {
    await chooseSavePath();
    if (!state.currentSavePath) return false;
  }
  return true;
}

function buildCurrentDownloadEntry() {
  return {
    id: crypto.randomUUID(),
    url: refs.urlInput.value.trim(),
    title: state.metadata.title,
    format: refs.formatSelect.value,
    quality: refs.qualitySelect.value,
    savePath: state.currentSavePath
  };
}

function resetCurrentSavePath() {
  state.currentSavePath = "";
  refs.savePathInput.value = "";
}

async function startPendingEntry(entry) {
  await window.youtubeDownloader.startDownload({
    url: entry.url,
    title: entry.title,
    format: entry.format,
    quality: entry.quality,
    savePath: entry.savePath
  });
}

async function handleDownload(event) {
  event.preventDefault();
  clearFlashMessage();
  if (!state.metadata) {
    setFlashMessage("Analyze a video first.", "error");
    return;
  }
  const hasSavePath = await ensureConfiguredSavePath();
  if (!hasSavePath) return;

  refs.downloadButton.disabled = true;
  refs.downloadButton.textContent = "Starting...";

  try {
    await startPendingEntry(buildCurrentDownloadEntry());
    setFlashMessage("Download started.", "success");
    resetCurrentSavePath();
  } catch (error) {
    setFlashMessage(error.message || "Could not start the download.", "error");
  } finally {
    syncDownloadButton();
    refs.downloadButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="download-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download';
  }
}

async function handleQueueCurrent() {
  clearFlashMessage();
  if (!state.metadata) {
    setFlashMessage("Analyze a video first.", "error");
    return;
  }
  const hasSavePath = await ensureConfiguredSavePath();
  if (!hasSavePath) return;
  state.pendingDownloads = [buildCurrentDownloadEntry(), ...state.pendingDownloads];
  renderPendingDownloads();
  resetCurrentSavePath();
  setFlashMessage("Added to queue.", "success");
}

async function handleCancelClick(event) {
  const button = event.target.closest("[data-cancel-id]");
  if (!button) return;
  await window.youtubeDownloader.cancelDownload(button.getAttribute("data-cancel-id"));
}

async function handleHistoryClick(event) {
  const item = event.target.closest("[data-history-path]");
  if (!item) return;
  if (item.getAttribute("data-history-status") === "completed") {
    await window.youtubeDownloader.openFolder(item.getAttribute("data-history-path"));
  }
}

async function handleClearHistory() {
  await window.youtubeDownloader.clearHistory();
  state.history = [];
  renderHistory();
}

async function handleQueuedClick(event) {
  const startBtn = event.target.closest("[data-start-queued]");
  if (startBtn) {
    const id = startBtn.getAttribute("data-start-queued");
    const entry = state.pendingDownloads.find((e) => e.id === id);
    if (!entry) return;
    startBtn.disabled = true;
    try {
      await startPendingEntry(entry);
      state.pendingDownloads = state.pendingDownloads.filter((e) => e.id !== id);
      renderPendingDownloads();
    } catch (error) {
      setFlashMessage(error.message || "Could not start download.", "error");
      renderPendingDownloads();
    }
    return;
  }
  const removeBtn = event.target.closest("[data-remove-queued]");
  if (!removeBtn) return;
  state.pendingDownloads = state.pendingDownloads.filter((e) => e.id !== removeBtn.getAttribute("data-remove-queued"));
  renderPendingDownloads();
}

async function handleStartAllQueued() {
  if (state.pendingDownloads.length === 0) return;
  refs.startAllQueuedButton.disabled = true;
  refs.startAllQueuedButton.textContent = "Starting...";
  const entries = [...state.pendingDownloads];
  const results = await Promise.allSettled(entries.map((e) => startPendingEntry(e)));
  const failedIds = new Set();
  results.forEach((r, i) => {
    if (r.status === "rejected") failedIds.add(entries[i].id);
  });
  state.pendingDownloads = state.pendingDownloads.filter((e) => failedIds.has(e.id));
  renderPendingDownloads();
  refs.startAllQueuedButton.textContent = "Start All";
  if (failedIds.size > 0) {
    setFlashMessage("Some downloads failed to start.", "error");
  } else {
    setFlashMessage("All queued downloads started.", "success");
  }
}

function handleDownloadEvent(payload) {
  if (payload.type === "download-started" || payload.type === "download-progress") {
    state.activeDownloads.set(payload.task.id, payload.task);
    renderActiveDownloads();
    return;
  }
  if (payload.type === "download-finished") {
    state.activeDownloads.delete(payload.task.id);
    renderActiveDownloads();
    if (payload.task.status === "cancelled") {
      setFlashMessage("Download cancelled.", "success");
    } else if (payload.task.status === "completed") {
      setFlashMessage("Download complete!", "success");
    } else if (payload.errorMessage) {
      setFlashMessage(payload.errorMessage, "error");
    }
    return;
  }
  if (payload.type === "history-updated") {
    state.history = [payload.entry, ...state.history.filter((e) => e.id !== payload.entry.id)];
    renderHistory();
  }
}

/* ---- Boot ---- */

function wireRefs() {
  refs.analyzeForm = document.getElementById("analyzeForm");
  refs.downloadForm = document.getElementById("downloadForm");
  refs.urlInput = document.getElementById("urlInput");
  refs.analyzeButton = document.getElementById("analyzeButton");
  refs.formatSelect = document.getElementById("formatSelect");
  refs.qualitySelect = document.getElementById("qualitySelect");
  refs.savePathInput = document.getElementById("savePathInput");
  refs.browseButton = document.getElementById("browseButton");
  refs.queueButton = document.getElementById("queueButton");
  refs.downloadButton = document.getElementById("downloadButton");
  refs.flashMessage = document.getElementById("flashMessage");
  refs.emptyState = document.getElementById("emptyState");
  refs.videoCard = document.getElementById("videoCard");
  refs.videoThumb = document.getElementById("videoThumb");
  refs.videoTitle = document.getElementById("videoTitle");
  refs.videoUploader = document.getElementById("videoUploader");
  refs.videoDuration = document.getElementById("videoDuration");
  refs.activeSection = document.getElementById("activeSection");
  refs.activeDownloads = document.getElementById("activeDownloads");
  refs.queueSection = document.getElementById("queueSection");
  refs.queuedDownloads = document.getElementById("queuedDownloads");
  refs.startAllQueuedButton = document.getElementById("startAllQueuedButton");
  refs.clearHistoryButton = document.getElementById("clearHistoryButton");
  refs.sidebarHistory = document.getElementById("sidebarHistory");
  refs.ytdlpDot = document.getElementById("ytdlpDot");
  refs.ffmpegDot = document.getElementById("ffmpegDot");
  refs.statusBarDownloads = document.getElementById("statusBarDownloads");
  refs.statusBarQueue = document.getElementById("statusBarQueue");
  refs.statusBarHistory = document.getElementById("statusBarHistory");
}

async function boot() {
  wireRefs();
  renderQualityOptions();
  syncDownloadButton();

  refs.analyzeForm.addEventListener("submit", handleAnalyze);
  refs.downloadForm.addEventListener("submit", handleDownload);
  refs.formatSelect.addEventListener("change", () => {
    renderQualityOptions();
    state.currentSavePath = "";
    refs.savePathInput.value = "";
  });
  refs.browseButton.addEventListener("click", chooseSavePath);
  refs.queueButton.addEventListener("click", handleQueueCurrent);
  refs.activeDownloads.addEventListener("click", handleCancelClick);
  refs.queuedDownloads.addEventListener("click", handleQueuedClick);
  refs.startAllQueuedButton.addEventListener("click", handleStartAllQueued);
  refs.sidebarHistory.addEventListener("click", handleHistoryClick);
  refs.clearHistoryButton.addEventListener("click", handleClearHistory);

  const bootstrap = await window.youtubeDownloader.getBootstrap();
  applyBootstrap(bootstrap);
  renderVideoCard();
  renderPendingDownloads();
  renderActiveDownloads();
  updateStatusBar();

  window.youtubeDownloader.onDownloadEvent(handleDownloadEvent);
  await runAutomationIfConfigured();
}

window.addEventListener("DOMContentLoaded", boot);
