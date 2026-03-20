/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type {
  AutomationConfig,
  BootstrapPayload,
  DownloadEvent,
  HistoryEntry,
  MetadataPayload,
  ProgressSnapshot,
  QualityOption,
  ToolStatus,
  YoutubeDownloaderAPI
} from "./types";

declare global {
  interface Window {
    youtubeDownloader: YoutubeDownloaderAPI;
  }
}

interface PendingEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  format: string;
  quality: string;
  savePath: string;
}

interface SidebarItem {
  id: string;
  title: string;
  format: string;
  quality: string;
  status: string;
  thumbnail: string;
  time: string;
  type: "active" | "queued" | "history";
  path: string;
}

interface Refs {
  analyzeForm: HTMLFormElement;
  urlInput: HTMLInputElement;
  analyzeButton: HTMLButtonElement;
  pasteButton: HTMLButtonElement;
  formatChips: HTMLElement;
  qualitySelect: HTMLSelectElement;
  savePathInput: HTMLInputElement;
  browseButton: HTMLButtonElement;
  queueButton: HTMLButtonElement;
  downloadButton: HTMLButtonElement;
  flashMessage: HTMLElement;
  emptyState: HTMLElement;
  videoCard: HTMLElement;
  videoThumb: HTMLElement;
  videoTitle: HTMLElement;
  videoUploader: HTMLElement;
  videoDuration: HTMLElement;
  inlineDownloadStatus: HTMLElement;
  activeSection: HTMLElement;
  activeDownloads: HTMLElement;
  queueSection: HTMLElement;
  queuedDownloads: HTMLElement;
  startAllQueuedButton: HTMLButtonElement;
  clearHistoryButton: HTMLButtonElement;
  sidebarList: HTMLElement;
  sidebarNav: HTMLElement;
  ytdlpDot: HTMLElement;
  ffmpegDot: HTMLElement;
  statusBarDownloads: HTMLElement;
  statusBarQueue: HTMLElement;
  statusBarHistory: HTMLElement;
  countAll: HTMLElement;
  countActive: HTMLElement;
  countQueued: HTMLElement;
  countCompleted: HTMLElement;
}

interface State {
  tools: ToolStatus | null;
  metadata: MetadataPayload | null;
  activeDownloads: Map<string, ProgressSnapshot>;
  pendingDownloads: PendingEntry[];
  history: HistoryEntry[];
  currentSavePath: string;
  automation: AutomationConfig | null;
  activeTab: string;
  selectedFormat: string;
}

const state: State = {
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

const refs = {} as Refs;

/* ---- Helpers ---- */

function getDurationLabel(seconds: number | null | undefined): string {
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

function getFileSizeLabel(bytes: number | null | undefined): string {
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

function getSpeedLabel(bps: number | null | undefined): string {
  return bps ? `${getFileSizeLabel(bps)}/s` : "---";
}

function getEtaLabel(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "---";
  if (seconds <= 0) return "finishing";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getYouTubeVideoId(url: string | null | undefined): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }

    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

/* ---- Flash ---- */

function setFlashMessage(message: string, type: string = "success"): void {
  refs.flashMessage.textContent = message;
  refs.flashMessage.className = `flash ${type}`;
}

function clearFlashMessage(): void {
  refs.flashMessage.textContent = "";
  refs.flashMessage.className = "flash hidden";
}

/* ---- Tool status ---- */

function renderToolStatus(): void {
  if (!state.tools) return;
  refs.ytdlpDot.className = `tool-dot ${state.tools.ytDlpAvailable ? "available" : "unavailable"}`;
  refs.ffmpegDot.className = `tool-dot ${state.tools.ffmpegAvailable ? "available" : "unavailable"}`;
}

/* ---- Tab counts ---- */

function updateCounts(): void {
  const activeCount = state.activeDownloads.size;
  const queuedCount = state.pendingDownloads.length;
  const completedCount = state.history.filter((e) => e.status === "completed").length;
  const totalCount = activeCount + queuedCount + state.history.length;

  refs.countAll.textContent = String(totalCount);
  refs.countActive.textContent = String(activeCount);
  refs.countQueued.textContent = String(queuedCount);
  refs.countCompleted.textContent = String(completedCount);

  refs.statusBarDownloads.innerHTML = `<span class="status-dot-live"></span> ${activeCount} active`;
  refs.statusBarQueue.textContent = `Queue: ${queuedCount}`;
  refs.statusBarHistory.textContent = `History: ${state.history.length}`;
}

/* ---- Sidebar list ---- */

function buildSidebarItems(): SidebarItem[] {
  const items: SidebarItem[] = [];

  for (const task of state.activeDownloads.values()) {
    items.push({
      id: task.id,
      title: task.title,
      format: task.format,
      quality: task.quality,
      status: task.status || "downloading",
      thumbnail: "",
      time: "",
      type: "active",
      path: ""
    });
  }

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

  for (const entry of state.history) {
    items.push({
      id: entry.id,
      title: entry.title,
      format: entry.format,
      quality: entry.quality,
      status: entry.status,
      thumbnail: "",
      time: timeAgo(entry.completedAt),
      type: "history",
      path: entry.outputPath || entry.savePath
    });
  }

  return items;
}

function filterByTab(items: SidebarItem[]): SidebarItem[] {
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

function renderSidebarList(): void {
  const items = filterByTab(buildSidebarItems());

  if (items.length === 0) {
    const labels: Record<string, string> = {
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

function renderVideoCard(): void {
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
  renderInlineDownloadStatus();
}

function renderInlineDownloadStatus(): void {
  const activeTasks = [...state.activeDownloads.values()];
  const metadataVideoId = getYouTubeVideoId(state.metadata?.webpageUrl);
  const currentTask =
    activeTasks.find((task) => {
      const taskVideoId = getYouTubeVideoId(task.url);
      if (metadataVideoId && taskVideoId) {
        return metadataVideoId === taskVideoId;
      }

      return state.metadata ? task.title === state.metadata.title : false;
    }) || activeTasks[0];

  if (!state.metadata || !currentTask) {
    refs.inlineDownloadStatus.className = "vc-live hidden";
    refs.inlineDownloadStatus.innerHTML = "";
    return;
  }

  const percent = Math.max(0, Math.min(100, currentTask.percent || 0));
  const eta = escapeHtml(getEtaLabel(currentTask.eta));
  const speed = escapeHtml(getSpeedLabel(currentTask.speed));
  const downloaded = escapeHtml(getFileSizeLabel(currentTask.downloadedBytes || 0));
  const total = escapeHtml(getFileSizeLabel(currentTask.totalBytes || 0));

  refs.inlineDownloadStatus.className = "vc-live";
  refs.inlineDownloadStatus.innerHTML = `
    <div class="vc-live-head">
      <div class="vc-live-labels">
        <span class="vc-live-kicker">Live download</span>
        <span class="vc-live-state ${escapeHtml(currentTask.status)}">${escapeHtml(currentTask.status)}</span>
      </div>
      <span class="vc-live-percent">${Math.round(percent)}%</span>
    </div>
    <div class="vc-live-track">
      <div class="vc-live-bar" style="width:${percent}%"></div>
    </div>
    <div class="vc-live-stats">
      <span>Speed <strong>${speed}</strong></span>
      <span>ETA <strong>${eta}</strong></span>
      <span>Size <strong>${downloaded} / ${total}</strong></span>
    </div>
  `;
}

/* ---- Format chips ---- */

function setActiveFormat(format: string): void {
  state.selectedFormat = format;
  for (const chip of Array.from(refs.formatChips.children)) {
    (chip as HTMLElement).classList.toggle("active", chip.getAttribute("data-format") === format);
  }
  renderQualityOptions();
  state.currentSavePath = "";
  refs.savePathInput.value = "";
}

/* ---- Quality options ---- */

function getQualityOptionsForFormat(format: string): QualityOption[] {
  if (!state.metadata) return [{ value: "best", label: "Best available" }];
  if (format === "mp3" || format === "wav") return state.metadata.availableAudioQualities;
  const options = state.metadata.availableVideoQualities[format as "mp4" | "webm"] || [];
  return options.length > 0 ? options : [{ value: "best", label: "Best available" }];
}

function renderQualityOptions(): void {
  const options = getQualityOptionsForFormat(state.selectedFormat);
  refs.qualitySelect.innerHTML = options
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join("");
}

/* ---- Active downloads ---- */

function renderActiveDownloads(): void {
  const tasks = [...state.activeDownloads.values()];
  if (tasks.length === 0) {
    refs.activeSection.style.display = "none";
    renderInlineDownloadStatus();
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
  renderInlineDownloadStatus();
  updateCounts();
  renderSidebarList();
}

/* ---- Queue ---- */

function renderPendingDownloads(): void {
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

function renderHistory(): void {
  renderInlineDownloadStatus();
  renderSidebarList();
  updateCounts();
}

function syncDownloadButton(): void {
  refs.downloadButton.disabled = !state.metadata;
}

function applyBootstrap(payload: BootstrapPayload): void {
  state.tools = payload.tools;
  state.history = payload.history || [];
  state.automation = payload.automation || null;
  renderToolStatus();
  renderHistory();
}

/* ---- Automation ---- */

async function runAutomationIfConfigured(): Promise<void> {
  if (!state.automation) return;

  try {
    if (state.automation.openFirstHistory && state.history[0]?.status === "completed") {
      await window.youtubeDownloader.openFolder(state.history[0].outputPath || state.history[0].savePath);
    }

    if (state.automation.clearHistory) {
      await window.youtubeDownloader.clearHistory();
      state.history = [];
      renderHistory();
    }

    if ((state.automation.openFirstHistory || state.automation.clearHistory) && !state.automation.autoStart) {
      if (state.automation.autoQuit) {
        await window.youtubeDownloader.quitApp();
      }
      return;
    }

    if (state.automation.queueItems && state.automation.queueItems.length > 0) {
      const pendingEntries: PendingEntry[] = [];

      for (const item of state.automation.queueItems) {
        const metadata = await window.youtubeDownloader.inspectUrl(item.url);
        pendingEntries.push({
          id: crypto.randomUUID(),
          url: item.url,
          title: metadata.title,
          thumbnail: metadata.thumbnail || "",
          format: item.format,
          quality: item.quality,
          savePath: item.savePath
        });
      }

      state.pendingDownloads = pendingEntries;
      renderPendingDownloads();
      setFlashMessage("Automation loaded queued downloads.", "success");

      if (!state.automation.autoStart) {
        return;
      }

      const startedIds = new Set<string>();

      for (const entry of pendingEntries) {
        const result = await window.youtubeDownloader.startDownload({
          url: entry.url,
          title: entry.title,
          format: entry.format,
          quality: entry.quality,
          savePath: entry.savePath
        });

        startedIds.add(entry.id);

        if (state.automation.cancelAfterMs && state.automation.cancelAfterMs > 0) {
          setTimeout(() => {
            void window.youtubeDownloader.cancelDownload(result.taskId);
          }, state.automation.cancelAfterMs);
        }
      }

      state.pendingDownloads = state.pendingDownloads.filter((entry) => !startedIds.has(entry.id));
      renderPendingDownloads();
      setFlashMessage("Automation started queued downloads.", "success");
      return;
    }

    if (!state.automation.url || !state.automation.savePath) {
      return;
    }

    refs.urlInput.value = state.automation.url;
    setActiveFormat(state.automation.format || "mp4");
    renderQualityOptions();

    const metadata = await window.youtubeDownloader.inspectUrl(state.automation.url);
    state.metadata = metadata;
    renderVideoCard();
    renderQualityOptions();
    syncDownloadButton();

    const automationQuality = state.automation.quality || "best";
    if ([...refs.qualitySelect.options].some((o) => o.value === automationQuality)) {
      refs.qualitySelect.value = automationQuality;
    }

    state.currentSavePath = state.automation.savePath;
    refs.savePathInput.value = state.automation.savePath;
    setFlashMessage("Automation loaded.", "success");

    if (!state.automation.autoStart) {
      return;
    }

    refs.downloadButton.disabled = true;
    const result = await window.youtubeDownloader.startDownload({
      url: state.automation.url,
      title: state.metadata.title,
      format: state.selectedFormat,
      quality: refs.qualitySelect.value,
      savePath: state.currentSavePath
    });

    if (state.automation.cancelAfterMs && state.automation.cancelAfterMs > 0) {
      setTimeout(() => {
        void window.youtubeDownloader.cancelDownload(result.taskId);
      }, state.automation.cancelAfterMs);
    }

    setFlashMessage("Automation started download.", "success");
    state.currentSavePath = "";
    refs.savePathInput.value = "";
  } catch (error) {
    setFlashMessage((error as Error).message || "Automation failed.", "error");
  } finally {
    refs.downloadButton.disabled = false;
  }
}

/* ---- Event handlers ---- */

async function handleAnalyze(event: Event): Promise<void> {
  event.preventDefault();
  clearFlashMessage();
  const url = refs.urlInput.value.trim();
  if (!url) {
    setFlashMessage("Paste a YouTube URL first.", "error");
    return;
  }

  refs.analyzeButton.disabled = true;
  refs.analyzeButton.querySelector("span")!.textContent = "Analyzing...";

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
    setFlashMessage((error as Error).message || "Could not analyze this link.", "error");
  } finally {
    refs.analyzeButton.disabled = false;
    refs.analyzeButton.querySelector("span")!.textContent = "Analyze";
  }
}

async function handlePaste(): Promise<void> {
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

async function chooseSavePath(): Promise<void> {
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

async function ensureConfiguredSavePath(): Promise<boolean> {
  if (!state.currentSavePath) {
    await chooseSavePath();
    if (!state.currentSavePath) return false;
  }
  return true;
}

function buildCurrentDownloadEntry(): PendingEntry {
  return {
    id: crypto.randomUUID(),
    url: refs.urlInput.value.trim(),
    title: state.metadata!.title,
    thumbnail: state.metadata!.thumbnail || "",
    format: state.selectedFormat,
    quality: refs.qualitySelect.value,
    savePath: state.currentSavePath
  };
}

function resetCurrentSavePath(): void {
  state.currentSavePath = "";
  refs.savePathInput.value = "";
}

async function startPendingEntry(entry: PendingEntry): Promise<string> {
  const result = await window.youtubeDownloader.startDownload({
    url: entry.url,
    title: entry.title,
    format: entry.format,
    quality: entry.quality,
    savePath: entry.savePath
  });
  return result.taskId;
}

async function handleDownload(): Promise<void> {
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
    setFlashMessage((error as Error).message || "Could not start the download.", "error");
  } finally {
    syncDownloadButton();
    refs.downloadButton.innerHTML = originalHTML;
  }
}

async function handleQueueCurrent(): Promise<void> {
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

async function handleCancelClick(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest("[data-cancel-id]");
  if (!button) return;
  await window.youtubeDownloader.cancelDownload(button.getAttribute("data-cancel-id")!);
}

async function handleSidebarClick(event: Event): Promise<void> {
  const item = (event.target as HTMLElement).closest("[data-sidebar-id]");
  if (!item) return;
  const type = item.getAttribute("data-sidebar-type");
  const status = item.getAttribute("data-sidebar-status");
  const itemPath = item.getAttribute("data-sidebar-path");

  if (type === "history" && status === "completed" && itemPath) {
    await window.youtubeDownloader.openFolder(itemPath);
  }
}

async function handleClearHistory(): Promise<void> {
  await window.youtubeDownloader.clearHistory();
  state.history = [];
  renderHistory();
}

function handleTabClick(event: Event): void {
  const tab = (event.target as HTMLElement).closest("[data-tab]");
  if (!tab) return;
  state.activeTab = tab.getAttribute("data-tab")!;
  for (const t of Array.from(refs.sidebarNav.querySelectorAll(".nav-tab"))) {
    (t as HTMLElement).classList.toggle("active", t.getAttribute("data-tab") === state.activeTab);
  }
  renderSidebarList();
}

function handleFormatChipClick(event: Event): void {
  const chip = (event.target as HTMLElement).closest("[data-format]");
  if (!chip) return;
  setActiveFormat(chip.getAttribute("data-format")!);
}

async function handleQueuedClick(event: Event): Promise<void> {
  const startBtn = (event.target as HTMLElement).closest("[data-start-queued]") as HTMLButtonElement | null;
  if (startBtn) {
    const id = startBtn.getAttribute("data-start-queued")!;
    const entry = state.pendingDownloads.find((e) => e.id === id);
    if (!entry) return;
    startBtn.disabled = true;
    try {
      await startPendingEntry(entry);
      state.pendingDownloads = state.pendingDownloads.filter((e) => e.id !== id);
      renderPendingDownloads();
    } catch (error) {
      setFlashMessage((error as Error).message || "Could not start download.", "error");
      renderPendingDownloads();
    }
    return;
  }
  const removeBtn = (event.target as HTMLElement).closest("[data-remove-queued]");
  if (!removeBtn) return;
  state.pendingDownloads = state.pendingDownloads.filter((e) => e.id !== removeBtn.getAttribute("data-remove-queued"));
  renderPendingDownloads();
}

async function handleStartAllQueued(): Promise<void> {
  if (state.pendingDownloads.length === 0) return;
  refs.startAllQueuedButton.disabled = true;
  const originalHTML = refs.startAllQueuedButton.innerHTML;
  refs.startAllQueuedButton.textContent = "Starting...";
  const entries = [...state.pendingDownloads];
  const results = await Promise.allSettled(entries.map((e) => startPendingEntry(e)));
  const failedIds = new Set<string>();
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

function handleDownloadEvent(payload: DownloadEvent): void {
  if (payload.type === "download-started" || payload.type === "download-progress") {
    state.activeDownloads.set(payload.task!.id, payload.task!);
    renderActiveDownloads();
    return;
  }
  if (payload.type === "download-finished") {
    state.activeDownloads.delete(payload.task!.id);
    renderActiveDownloads();
    if (payload.task!.status === "cancelled") {
      setFlashMessage("Download cancelled.", "success");
    } else if (payload.task!.status === "completed") {
      setFlashMessage("Download complete!", "success");
    } else if (payload.errorMessage) {
      setFlashMessage(payload.errorMessage, "error");
    }
    return;
  }
  if (payload.type === "history-updated") {
    state.history = [payload.entry!, ...state.history.filter((e) => e.id !== payload.entry!.id)];
    renderHistory();
  }
}

/* ---- Boot ---- */

function wireRefs(): void {
  refs.analyzeForm = document.getElementById("analyzeForm") as HTMLFormElement;
  refs.urlInput = document.getElementById("urlInput") as HTMLInputElement;
  refs.analyzeButton = document.getElementById("analyzeButton") as HTMLButtonElement;
  refs.pasteButton = document.getElementById("pasteButton") as HTMLButtonElement;
  refs.formatChips = document.getElementById("formatChips")!;
  refs.qualitySelect = document.getElementById("qualitySelect") as HTMLSelectElement;
  refs.savePathInput = document.getElementById("savePathInput") as HTMLInputElement;
  refs.browseButton = document.getElementById("browseButton") as HTMLButtonElement;
  refs.queueButton = document.getElementById("queueButton") as HTMLButtonElement;
  refs.downloadButton = document.getElementById("downloadButton") as HTMLButtonElement;
  refs.flashMessage = document.getElementById("flashMessage")!;
  refs.emptyState = document.getElementById("emptyState")!;
  refs.videoCard = document.getElementById("videoCard")!;
  refs.videoThumb = document.getElementById("videoThumb")!;
  refs.videoTitle = document.getElementById("videoTitle")!;
  refs.videoUploader = document.getElementById("videoUploader")!;
  refs.videoDuration = document.getElementById("videoDuration")!;
  refs.inlineDownloadStatus = document.getElementById("inlineDownloadStatus")!;
  refs.activeSection = document.getElementById("activeSection")!;
  refs.activeDownloads = document.getElementById("activeDownloads")!;
  refs.queueSection = document.getElementById("queueSection")!;
  refs.queuedDownloads = document.getElementById("queuedDownloads")!;
  refs.startAllQueuedButton = document.getElementById("startAllQueuedButton") as HTMLButtonElement;
  refs.clearHistoryButton = document.getElementById("clearHistoryButton") as HTMLButtonElement;
  refs.sidebarList = document.getElementById("sidebarList")!;
  refs.sidebarNav = document.querySelector(".sidebar-nav")!;
  refs.ytdlpDot = document.getElementById("ytdlpDot")!;
  refs.ffmpegDot = document.getElementById("ffmpegDot")!;
  refs.statusBarDownloads = document.getElementById("statusBarDownloads")!;
  refs.statusBarQueue = document.getElementById("statusBarQueue")!;
  refs.statusBarHistory = document.getElementById("statusBarHistory")!;
  refs.countAll = document.getElementById("countAll")!;
  refs.countActive = document.getElementById("countActive")!;
  refs.countQueued = document.getElementById("countQueued")!;
  refs.countCompleted = document.getElementById("countCompleted")!;
}

async function boot(): Promise<void> {
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
