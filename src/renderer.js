const state = {
  tools: null,
  metadata: null,
  activeDownloads: new Map(),
  pendingDownloads: [],
  history: [],
  currentSavePath: "",
  automation: null,
  activeTab: "all",
  selectedFormat: "mp4"
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
  refs.ytdlpDot.className = `tool-dot ${state.tools.ytDlpAvailable ? "available" : "unavailable"}`;
  refs.ffmpegDot.className = `tool-dot ${state.tools.ffmpegAvailable ? "available" : "unavailable"}`;
}

/* ---- Tab counts ---- */

function updateCounts() {
  const activeCount = state.activeDownloads.size;
  const queuedCount = state.pendingDownloads.length;
  const completedCount = state.history.filter((e) => e.status === "completed").length;
  const totalCount = activeCount + queuedCount + state.history.length;

  refs.countAll.textContent = totalCount;
  refs.countActive.textContent = activeCount;
  refs.countQueued.textContent = queuedCount;
  refs.countCompleted.textContent = completedCount;

  refs.statusBarDownloads.innerHTML = `<span class="status-dot-live"></span> ${activeCount} active`;
  refs.statusBarQueue.textContent = `Queue: ${queuedCount}`;
  refs.statusBarHistory.textContent = `History: ${state.history.length}`;
}

/* ---- Sidebar list ---- */

function buildSidebarItems() {
  const items = [];

  // Active downloads
  for (const task of state.activeDownloads.values()) {
    items.push({
      id: task.id,
      title: task.title,
      format: task.format,
      quality: task.quality,
      status: task.status || "downloading",
      thumbnail: task.thumbnail || "",
      time: "",
      type: "active",
      path: ""
    });
  }

  // Queued
  for (const entry of state.pendingDownloads) {
    items.push({
      id: entry.id,
      title: entry.title,
      format: entry.format,
      quality: entry.quality,
      status: "queued",
      thumbnail: entry.thumbnail || "",
      time: "",
      type: "queued",
      path: ""
    });
  }

  // History
  for (const entry of state.history) {
    items.push({
      id: entry.id,
      title: entry.title,
      format: entry.format,
      quality: entry.quality,
      status: entry.status,
      thumbnail: entry.thumbnail || "",
      time: timeAgo(entry.completedAt),
      type: "history",
      path: entry.outputPath || entry.savePath
    });
  }

  return items;
}

function filterByTab(items) {
  switch (state.activeTab) {
    case "active":
      return items.filter((i) => i.type === "active");
    case "queued":
      return items.filter((i) => i.type === "queued");
    case "completed":
      return items.filter((i) => i.status === "completed");
    default:
      return items;
  }
}

function renderSidebarList() {
  const items = filterByTab(buildSidebarItems());

  if (items.length === 0) {
    const labels = {
      all: "No downloads yet",
      active: "No active downloads",
      queued: "No queued items",
      completed: "No completed downloads"
    };
    refs.sidebarList.innerHTML = `
      <div class="sidebar-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>${escapeHtml(labels[state.activeTab] || labels.all)}</span>
      </div>`;
    return;
  }

  refs.sidebarList.innerHTML = items
    .map(
      (item) => `
    <div class="sidebar-item" data-sidebar-id="${escapeHtml(item.id)}" data-sidebar-type="${escapeHtml(item.type)}" data-sidebar-path="${escapeHtml(item.path)}" data-sidebar-status="${escapeHtml(item.status)}">
      <div class="sidebar-item-thumb">${item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="" />` : ""}</div>
      <div class="sidebar-item-info">
        <div class="sidebar-item-title">${escapeHtml(item.title)}</div>
        <div class="sidebar-item-meta">${escapeHtml(item.format.toUpperCase())}${item.time ? ` · ${escapeHtml(item.time)}` : ""}</div>
      </div>
      <div class="sidebar-item-status ${escapeHtml(item.status)}"></div>
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

/* ---- Format chips ---- */

function setActiveFormat(format) {
  state.selectedFormat = format;
  for (const chip of refs.formatChips.children) {
    chip.classList.toggle("active", chip.getAttribute("data-format") === format);
  }
  renderQualityOptions();
  state.currentSavePath = "";
  refs.savePathInput.value = "";
}

/* ---- Quality options ---- */

function getQualityOptionsForFormat(format) {
  if (!state.metadata) return [{ value: "best", label: "Best available" }];
  if (format === "mp3" || format === "wav") return state.metadata.availableAudioQualities;
  const options = state.metadata.availableVideoQualities[format] || [];
  return options.length > 0 ? options : [{ value: "best", label: "Best available" }];
}

function renderQualityOptions() {
  const options = getQualityOptionsForFormat(state.selectedFormat);
  refs.qualitySelect.innerHTML = options
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join("");
}

/* ---- Active downloads ---- */

function renderActiveDownloads() {
  const tasks = [...state.activeDownloads.values()];
  if (tasks.length === 0) {
    refs.activeSection.style.display = "none";
    updateCounts();
    renderSidebarList();
    return;
  }

  refs.activeSection.style.display = "";
  refs.activeDownloads.innerHTML = tasks
    .map(
      (t) => `
    <div class="dl-card">
      <div class="dl-content">
        <div class="dl-top-row">
          <div class="dl-title">${escapeHtml(t.title)}</div>
          <div class="dl-actions">
            <span class="dl-tag dl-tag-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
            <button class="dl-cancel-btn" type="button" data-cancel-id="${escapeHtml(t.id)}">Cancel</button>
          </div>
        </div>
        <div class="dl-format-tag">${escapeHtml(t.format.toUpperCase())} · ${escapeHtml(t.quality === "best" ? "Best" : t.quality)}</div>
        <div class="dl-progress-track"><div class="dl-progress-bar" style="width:${Math.max(0, Math.min(100, t.percent || 0))}%"></div></div>
        <div class="dl-stats">
          <span><span class="dl-stat-val">${Math.round(t.percent || 0)}%</span></span>
          <span><span class="dl-stat-val">${escapeHtml(getSpeedLabel(t.speed))}</span></span>
          <span>ETA <span class="dl-stat-val">${escapeHtml(getEtaLabel(t.eta))}</span></span>
          <span><span class="dl-stat-val">${escapeHtml(getFileSizeLabel(t.downloadedBytes || 0))}</span> / ${escapeHtml(getFileSizeLabel(t.totalBytes || 0))}</span>
        </div>
      </div>
    </div>`
    )
    .join("");
  updateCounts();
  renderSidebarList();
}

/* ---- Queue ---- */

function renderPendingDownloads() {
  if (state.pendingDownloads.length === 0) {
    refs.queueSection.style.display = "none";
    refs.startAllQueuedButton.disabled = true;
    updateCounts();
    renderSidebarList();
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
  updateCounts();
  renderSidebarList();
}

function renderHistory() {
  renderSidebarList();
  updateCounts();
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
  setActiveFormat(state.automation.format);
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
      format: state.selectedFormat,
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
  refs.analyzeButton.querySelector("span").textContent = "Analyzing...";

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
    refs.analyzeButton.querySelector("span").textContent = "Analyze";
  }
}

async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && (text.includes("youtube.com") || text.includes("youtu.be"))) {
      refs.urlInput.value = text;
      refs.analyzeForm.dispatchEvent(new Event("submit", { cancelable: true }));
    } else if (text) {
      refs.urlInput.value = text;
    }
  } catch {
    /* clipboard access denied — ignore */
  }
}

async function chooseSavePath() {
  if (!state.metadata) {
    setFlashMessage("Analyze a video first.", "error");
    return;
  }
  const response = await window.youtubeDownloader.browseSavePath({
    suggestedFilename: state.metadata.suggestedFilename,
    format: state.selectedFormat
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
    thumbnail: state.metadata.thumbnail || "",
    format: state.selectedFormat,
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

async function handleDownload() {
  clearFlashMessage();
  if (!state.metadata) {
    setFlashMessage("Analyze a video first.", "error");
    return;
  }
  const hasSavePath = await ensureConfiguredSavePath();
  if (!hasSavePath) return;

  refs.downloadButton.disabled = true;
  const originalHTML = refs.downloadButton.innerHTML;
  refs.downloadButton.textContent = "Starting...";

  try {
    await startPendingEntry(buildCurrentDownloadEntry());
    setFlashMessage("Download started.", "success");
    resetCurrentSavePath();
  } catch (error) {
    setFlashMessage(error.message || "Could not start the download.", "error");
  } finally {
    syncDownloadButton();
    refs.downloadButton.innerHTML = originalHTML;
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

async function handleSidebarClick(event) {
  const item = event.target.closest("[data-sidebar-id]");
  if (!item) return;
  const type = item.getAttribute("data-sidebar-type");
  const status = item.getAttribute("data-sidebar-status");
  const itemPath = item.getAttribute("data-sidebar-path");

  if (type === "history" && status === "completed" && itemPath) {
    await window.youtubeDownloader.openFolder(itemPath);
  }
}

async function handleClearHistory() {
  await window.youtubeDownloader.clearHistory();
  state.history = [];
  renderHistory();
}

function handleTabClick(event) {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  state.activeTab = tab.getAttribute("data-tab");
  for (const t of refs.sidebarNav.querySelectorAll(".nav-tab")) {
    t.classList.toggle("active", t.getAttribute("data-tab") === state.activeTab);
  }
  renderSidebarList();
}

function handleFormatChipClick(event) {
  const chip = event.target.closest("[data-format]");
  if (!chip) return;
  setActiveFormat(chip.getAttribute("data-format"));
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
  const originalHTML = refs.startAllQueuedButton.innerHTML;
  refs.startAllQueuedButton.textContent = "Starting...";
  const entries = [...state.pendingDownloads];
  const results = await Promise.allSettled(entries.map((e) => startPendingEntry(e)));
  const failedIds = new Set();
  results.forEach((r, i) => {
    if (r.status === "rejected") failedIds.add(entries[i].id);
  });
  state.pendingDownloads = state.pendingDownloads.filter((e) => failedIds.has(e.id));
  renderPendingDownloads();
  refs.startAllQueuedButton.innerHTML = originalHTML;
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
  refs.urlInput = document.getElementById("urlInput");
  refs.analyzeButton = document.getElementById("analyzeButton");
  refs.pasteButton = document.getElementById("pasteButton");
  refs.formatChips = document.getElementById("formatChips");
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
  refs.sidebarList = document.getElementById("sidebarList");
  refs.sidebarNav = document.querySelector(".sidebar-nav");
  refs.ytdlpDot = document.getElementById("ytdlpDot");
  refs.ffmpegDot = document.getElementById("ffmpegDot");
  refs.statusBarDownloads = document.getElementById("statusBarDownloads");
  refs.statusBarQueue = document.getElementById("statusBarQueue");
  refs.statusBarHistory = document.getElementById("statusBarHistory");
  refs.countAll = document.getElementById("countAll");
  refs.countActive = document.getElementById("countActive");
  refs.countQueued = document.getElementById("countQueued");
  refs.countCompleted = document.getElementById("countCompleted");
}

async function boot() {
  wireRefs();
  renderQualityOptions();
  syncDownloadButton();

  refs.analyzeForm.addEventListener("submit", handleAnalyze);
  refs.downloadButton.addEventListener("click", handleDownload);
  refs.pasteButton.addEventListener("click", handlePaste);
  refs.formatChips.addEventListener("click", handleFormatChipClick);
  refs.browseButton.addEventListener("click", chooseSavePath);
  refs.queueButton.addEventListener("click", handleQueueCurrent);
  refs.activeDownloads.addEventListener("click", handleCancelClick);
  refs.queuedDownloads.addEventListener("click", handleQueuedClick);
  refs.startAllQueuedButton.addEventListener("click", handleStartAllQueued);
  refs.sidebarList.addEventListener("click", handleSidebarClick);
  refs.sidebarNav.addEventListener("click", handleTabClick);
  refs.clearHistoryButton.addEventListener("click", handleClearHistory);

  const bootstrap = await window.youtubeDownloader.getBootstrap();
  applyBootstrap(bootstrap);
  renderVideoCard();
  renderPendingDownloads();
  renderActiveDownloads();
  updateCounts();

  window.youtubeDownloader.onDownloadEvent(handleDownloadEvent);
  await runAutomationIfConfigured();
}

window.addEventListener("DOMContentLoaded", boot);
