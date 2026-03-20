# Architecture — YouTube Video Downloader

Technical architecture reference with type definitions and protocol specifications.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electron Application                         │
│                                                                     │
│  ┌─────────────┐   contextBridge   ┌─────────────────────────────┐ │
│  │  Renderer    │ ◄──────────────► │  Preload (preload.js)       │ │
│  │  Process     │   8 methods      │  contextBridge.              │ │
│  │              │                  │  exposeInMainWorld()        │ │
│  │  renderer.js │   IPC invoke     ┌─────────────────────────────┐ │
│  │  index.html  │ ────────────────►│  Main Process (main.js)     │ │
│  │  styles.css  │ ◄────────────────│                             │ │
│  │              │   downloads:event│  ┌─────────┐  ┌──────────┐  │ │
│  └─────────────┘   (push)         │  │ IPC     │  │ Download │  │ │
│                                    │  │ Handlers│  │ Manager  │  │ │
│                                    │  └─────────┘  └────┬─────┘  │ │
│                                    │  ┌─────────┐       │        │ │
│                                    │  │ History │  spawn │        │ │
│                                    │  │ Manager │       ▼        │ │
│                                    │  └────┬────┘  ┌─────────┐  │ │
│                                    │       │       │  yt-dlp  │  │ │
│                                    │       ▼       │  +ffmpeg │  │ │
│                                    │  ┌────────┐   └────┬────┘  │ │
│                                    │  │  JSON  │        │       │ │
│                                    │  │  file  │        ▼       │ │
│                                    │  └────────┘   YouTube API  │ │
│                                    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Process Model

### Main Process (`main.ts`)

Responsibilities:

- Create and manage the BrowserWindow
- Register 7 IPC `handle` channels
- Detect yt-dlp and ffmpeg binary availability
- Spawn yt-dlp child processes for URL inspection and downloads
- Parse stdout/stderr for progress updates and final output path
- Send real-time progress events to renderer via `webContents.send`
- Manage download history (load, save, prepend) as JSON file
- Expose automation config from environment variables

Key objects:

- `activeDownloads: Map<string, Task>` — live download tasks with child process refs
- `historyEntries: HistoryEntry[]` — persisted download history
- `toolStatus: ToolStatus` — detected tool availability
- `mainWindow: BrowserWindow` — the single app window

### Preload Process (`preload.ts`)

Responsibilities:

- Bridge exactly 8 methods from renderer to main via `contextBridge`
- 7 methods use `ipcRenderer.invoke()` (request/response)
- 1 method (`onDownloadEvent`) uses `ipcRenderer.on()` (event listener)
- Returns an unsubscribe function for the event listener

### Renderer Process (`src/renderer.ts`)

Responsibilities:

- Manage UI state in a single `state` object
- Cache DOM references in a `refs` object (wired in `wireRefs()`)
- Render all UI updates via direct DOM manipulation (innerHTML + textContent)
- Handle user interactions (form submit, button clicks, tab navigation)
- Receive download events and update state + UI accordingly
- Run automation flow if configured

## Module Dependency Graph

```
main.ts
├── electron (app, BrowserWindow, dialog, ipcMain, shell)
├── child_process (spawn, ChildProcess, SpawnOptions)
├── crypto
├── fs/promises
├── path
├── lib/utils.ts (sanitizeFilename, ensureExtension, formatFilterFor,
│                  buildFormatArguments, parseProgressLine, buildMetadataPayload)
└── src/types.ts (all shared interfaces)

preload.ts
├── electron (contextBridge, ipcRenderer, IpcRendererEvent)
└── src/types.ts (YoutubeDownloaderAPI and related interfaces)

src/renderer.ts
├── src/types.ts (imported for type annotations only — stripped at compile)
├── window.youtubeDownloader (from preload, typed via global augmentation)
├── crypto.randomUUID (browser global)
└── (duplicates 5 functions from lib/utils.ts inline)

tests/utils.test.ts
├── node:test (describe, it)
├── node:assert/strict
└── lib/utils.ts (all 14 exports)
```

## IPC Protocol Specification

### `app:get-bootstrap`

Bootstrap the renderer with initial application state.

```
Direction: renderer → main (invoke)
Request:   (none)
Response:  {
  tools: ToolStatus,
  history: HistoryEntry[],
  automation: AutomationConfig | null
}
```

### `downloads:inspect-url`

Fetch metadata for a YouTube URL using yt-dlp.

```
Direction: renderer → main (invoke)
Request:   url: string
Response:  MetadataPayload
Throws:    Error if yt-dlp unavailable or URL invalid
yt-dlp:    --dump-single-json --skip-download --no-warnings --no-playlist <url>
```

### `downloads:browse-save-path`

Open a native save dialog for the user to choose a file path.

```
Direction: renderer → main (invoke)
Request:   { suggestedFilename: string, format: string }
Response:  { filePath: string } | null
Notes:     Returns null if user cancels dialog.
           filePath has extension ensured via ensureExtension().
```

### `downloads:start`

Start a download by spawning a yt-dlp child process.

```
Direction: renderer → main (invoke)
Request:   {
  url: string,
  title: string,
  format: "mp4" | "webm" | "mp3" | "wav",
  quality: "best" | string,
  savePath: string
}
Response:  { taskId: string }  (UUID)
Throws:    Error if yt-dlp or ffmpeg unavailable
Side effects: Spawns child process, emits download events
```

### `downloads:cancel`

Cancel an active download by killing its child process.

```
Direction: renderer → main (invoke)
Request:   taskId: string
Response:  boolean (true if found and killed, false if not found)
Signal:    SIGINT
```

### `history:open-folder`

Reveal a downloaded file in the OS file manager.

```
Direction: renderer → main (invoke)
Request:   filePath: string
Response:  true
Uses:      shell.showItemInFolder()
```

### `history:clear`

Clear all download history.

```
Direction: renderer → main (invoke)
Request:   (none)
Response:  true
Side effects: Empties historyEntries array and overwrites JSON file
```

### `downloads:event` (push channel)

Real-time download event pushed from main to renderer.

```
Direction: main → renderer (webContents.send)
Payload:   DownloadEvent (union type, see below)
```

## Type Definitions

These types are defined in `src/types.ts` and used throughout the TypeScript codebase.

### ToolStatus

```ts
interface ToolStatus {
  ytDlpPath: string; // Resolved path or "yt-dlp"
  ffmpegPath: string; // Resolved path or "ffmpeg"
  ytDlpAvailable: boolean; // true if --version succeeds
  ffmpegAvailable: boolean; // true if -version succeeds
}
```

### MetadataPayload

```ts
interface MetadataPayload {
  title: string; // Video title or "Untitled video"
  uploader: string; // Channel name or "Unknown creator"
  duration: number; // Seconds (0 if unknown)
  thumbnail: string; // URL or ""
  webpageUrl: string; // Original or canonical URL
  suggestedFilename: string; // sanitizeFilename(title)
  availableVideoQualities: {
    mp4: QualityOption[]; // Filtered by ext="mp4"
    webm: QualityOption[]; // Filtered by ext="webm"
  };
  availableAudioQualities: QualityOption[]; // From abr values
}
```

### QualityOption

```ts
interface QualityOption {
  value: string; // "best" | "1080" | "720" | "480" | "320" | "256" | etc.
  label: string; // "Best available" | "1080p" | "320 kbps" | etc.
}
```

### ProgressSnapshot

```ts
interface ProgressSnapshot {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string;
  status: "starting" | "downloading" | "processing" | "completed" | "failed" | "cancelled";
  percent: number; // 0-100
  speed: number; // bytes/sec
  eta: number; // seconds
  downloadedBytes: number;
  totalBytes: number;
}
```

### HistoryEntry

```ts
interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string;
  status: "completed" | "failed" | "cancelled";
  errorMessage: string;
  fileSize: number; // bytes (0 if failed/cancelled)
  completedAt: string; // ISO 8601 timestamp
}
```

### DownloadTask (main process internal)

```ts
interface DownloadTask {
  id: string; // crypto.randomUUID()
  title: string;
  url: string;
  format: string;
  quality: string;
  savePath: string;
  outputPath: string; // Updated when __FINAL_PATH__ received
  status: string;
  cancelled: boolean;
  settled: boolean; // Prevents double-handling of close/error
  process: ChildProcess; // The yt-dlp spawn
}
```

### AutomationConfig

```ts
interface AutomationConfig {
  url: string; // AUTO_URL env var
  savePath: string; // AUTO_SAVE_PATH env var
  format: string; // AUTO_FORMAT or "mp4"
  quality: string; // AUTO_QUALITY or "best"
  autoStart: boolean; // AUTO_START === "1"
}
```

### DownloadEvent (union)

```ts
type DownloadEvent =
  | { type: "download-started"; task: ProgressSnapshot }
  | { type: "download-progress"; task: ProgressSnapshot }
  | { type: "download-finished"; task: ProgressSnapshot; errorMessage: string }
  | { type: "history-updated"; entry: HistoryEntry };
```

## yt-dlp Integration Details

### URL Inspection

```bash
yt-dlp --dump-single-json --skip-download --no-warnings --no-playlist <url>
```

Returns a large JSON object. The app extracts: `title`, `uploader`, `channel`, `duration`, `thumbnail`, `webpage_url`, `formats[]`.

### Download Execution

```bash
yt-dlp \
  --newline \
  --progress \
  --progress-template "download:%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress._percent_str)s|%(progress.speed)s|%(progress.eta)s" \
  --no-warnings \
  --ffmpeg-location <ffmpegPath> \
  --print "after_move:__FINAL_PATH__:%(filepath)s" \
  --output <savePath> \
  <format-args...> \
  <url>
```

### Progress Template Fields

```
download:<status>|<downloaded_bytes>|<total_bytes>|<total_bytes_estimate>|<percent>|<speed>|<eta>
```

Parsed by `parseProgressLine()` which splits on `|` and extracts numeric values.

### Format Arguments

Built by `buildFormatArguments({ format, quality })`:

**Video (mp4/webm)**:

- Best: `--format "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best" --merge-output-format mp4`
- Specific: `--format "bv*[ext=mp4][height<=?720]+ba[ext=m4a]/..." --merge-output-format mp4`

**Audio (mp3/wav)**:

- Best: `--format bestaudio/best --extract-audio --audio-format mp3 --audio-quality 0`
- Specific: `--format bestaudio/best --extract-audio --audio-format mp3 --audio-quality 192`

### Exit Codes

- `0` — success → status `completed`
- Non-zero — failure → status `failed`, error from last `ERROR:` line or generic message

### Final Path Detection

The `--print after_move:__FINAL_PATH__:%(filepath)s` flag causes yt-dlp to print the final file path after any post-processing moves. The main process captures lines starting with `__FINAL_PATH__:` and updates `task.outputPath`.

## File System Layout

### History Storage

Path: `app.getPath("userData") + "/download-history.json"`

Platform-specific:

- macOS: `~/Library/Application Support/youtube-video-downloader/download-history.json`
- Windows: `%APPDATA%/youtube-video-downloader/download-history.json`
- Linux: `~/.config/youtube-video-downloader/download-history.json`

Format: JSON array of HistoryEntry objects. Maximum 200 entries (FIFO, oldest pruned).

### Download Output

User-selected via native save dialog. Default directory: `app.getPath("downloads")`.
Filename: `sanitizeFilename(title) + "." + format`.

## UI Component Map

```
body
└── .app (flex row, 100vh)
    ├── aside.sidebar (260px fixed)
    │   ├── .sidebar-header
    │   │   └── .sidebar-brand (logo + "YT Downloader v1.0.0")
    │   ├── nav.sidebar-nav
    │   │   ├── button.nav-tab[data-tab="all"]    + #countAll
    │   │   ├── button.nav-tab[data-tab="active"] + #countActive
    │   │   ├── button.nav-tab[data-tab="queued"] + #countQueued
    │   │   └── button.nav-tab[data-tab="completed"] + #countCompleted
    │   ├── .sidebar-list-wrap
    │   │   └── #sidebarList (scrollable, .sidebar-item elements)
    │   └── .sidebar-footer
    │       ├── #clearHistoryButton
    │       └── .tool-status (#ytdlpDot + #ffmpegDot)
    │
    ├── main.workspace (flex column, fills remaining width)
    │   ├── header.action-bar
    │   │   └── form#analyzeForm.url-bar
    │   │       ├── #urlInput (type="url")
    │   │       ├── #pasteButton
    │   │       └── #analyzeButton (submit)
    │   ├── #flashMessage.flash
    │   ├── .content-scroll (scrollable)
    │   │   ├── #emptyState (shown when no metadata)
    │   │   ├── #videoCard (shown after analysis)
    │   │   │   ├── .vc-media (#videoThumb + #videoDuration)
    │   │   │   ├── .vc-info (#videoTitle + #videoUploader)
    │   │   │   ├── .vc-options
    │   │   │   │   ├── #formatChips (mp4/webm/mp3/wav buttons)
    │   │   │   │   ├── #qualitySelect (dropdown)
    │   │   │   │   └── #savePathInput + #browseButton
    │   │   │   └── .vc-actions (#downloadButton + #queueButton)
    │   │   ├── #activeSection
    │   │   │   └── #activeDownloads (.dl-card elements)
    │   │   └── #queueSection
    │   │       ├── #startAllQueuedButton
    │   │       └── #queuedDownloads (.q-card elements)
    │   └── footer.status-bar
    │       ├── #statusBarDownloads + #statusBarQueue + #statusBarHistory
    │       └── #statusBarVersion
    │
    └── (no other top-level children)
```
