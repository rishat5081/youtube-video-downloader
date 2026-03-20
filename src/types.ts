export interface ToolStatus {
  ytDlpPath: string;
  ffmpegPath: string;
  ytDlpAvailable: boolean;
  ffmpegAvailable: boolean;
}

export interface QualityOption {
  value: string;
  label: string;
}

export interface ProgressSnapshot {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string;
  status: string;
  percent: number;
  speed: number;
  eta: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface ProgressData {
  status: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

export interface MetadataPayload {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  webpageUrl: string;
  suggestedFilename: string;
  availableVideoQualities: {
    mp4: QualityOption[];
    webm: QualityOption[];
  };
  availableAudioQualities: QualityOption[];
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string;
  status: string;
  errorMessage: string;
  fileSize: number;
  completedAt: string;
}

export interface DownloadTask {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string;
  status: string;
  cancelled: boolean;
  settled: boolean;
  process: import("child_process").ChildProcess;
}

export interface AutomationConfig {
  url: string;
  savePath: string;
  format: string;
  quality: string;
  autoStart: boolean;
}

export interface BootstrapPayload {
  tools: ToolStatus;
  history: HistoryEntry[];
  automation: AutomationConfig | null;
}

export interface DownloadEvent {
  type: "download-started" | "download-progress" | "download-finished" | "history-updated";
  task?: ProgressSnapshot;
  entry?: HistoryEntry;
  errorMessage?: string;
}

export interface BrowseSavePathPayload {
  suggestedFilename: string;
  format: string;
}

export interface StartDownloadPayload {
  url: string;
  title: string;
  format: string;
  quality: string;
  savePath: string;
}

export interface FormatFilter {
  name: string;
  extensions: string[];
}

export interface FormatArgInput {
  format: string;
  quality: string;
}

export interface YtDlpFormat {
  vcodec?: string;
  height?: number;
  ext?: string;
  abr?: number;
  [key: string]: unknown;
}

export interface YtDlpInfo {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  formats?: YtDlpFormat[];
  [key: string]: unknown;
}

export interface YoutubeDownloaderAPI {
  getBootstrap(): Promise<BootstrapPayload>;
  inspectUrl(url: string): Promise<MetadataPayload>;
  browseSavePath(payload: BrowseSavePathPayload): Promise<{ filePath: string } | null>;
  startDownload(payload: StartDownloadPayload): Promise<{ taskId: string }>;
  cancelDownload(taskId: string): Promise<boolean>;
  openFolder(filePath: string): Promise<true>;
  clearHistory(): Promise<true>;
  onDownloadEvent(callback: (payload: DownloadEvent) => void): () => void;
}
