# Requirements — YouTube Video Downloader

Functional and non-functional requirements derived from the implemented codebase behavior.

## Functional Requirements

### FR-1: URL Analysis

| ID     | Requirement                                                          | Implementation                                                                |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FR-1.1 | The app shall accept a YouTube URL via text input                    | `#urlInput` in action bar                                                     |
| FR-1.2 | The app shall provide a paste-from-clipboard button                  | `#pasteButton` reads clipboard, auto-triggers analyze if YouTube URL detected |
| FR-1.3 | The app shall fetch video metadata using yt-dlp                      | `inspectUrl()` → `yt-dlp --dump-single-json --skip-download`                  |
| FR-1.4 | The app shall display video title, uploader, duration, and thumbnail | Rendered in `#videoCard` after analysis                                       |
| FR-1.5 | The app shall extract available video qualities per format           | `extractVideoQualities()` filters by extension and vcodec                     |
| FR-1.6 | The app shall extract available audio bitrates                       | `extractAudioQualities()` filters by abr >= 64                                |
| FR-1.7 | The app shall display an error message if analysis fails             | Flash message with error type                                                 |
| FR-1.8 | The app shall disable the analyze button during analysis             | Button disabled + text changes to "Analyzing..."                              |

### FR-2: Format & Quality Selection

| ID     | Requirement                                                               | Implementation                                         |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| FR-2.1 | The app shall support 4 formats: MP4, WEBM, MP3, WAV                      | Format chip buttons in `#formatChips`                  |
| FR-2.2 | Format selection shall update available quality options                   | `setActiveFormat()` → `renderQualityOptions()`         |
| FR-2.3 | Each format shall always include "Best available" as first quality option | Hardcoded first entry in quality extraction functions  |
| FR-2.4 | Video formats shall show resolution options (e.g., 1080p, 720p)           | `extractVideoQualities()` returns height-based options |
| FR-2.5 | Audio formats shall show bitrate options (e.g., 320 kbps, 256 kbps)       | `extractAudioQualities()` returns abr-based options    |
| FR-2.6 | Changing format shall reset the save path                                 | `setActiveFormat()` clears `currentSavePath`           |

### FR-3: Download Execution

| ID     | Requirement                                                           | Implementation                                                 |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| FR-3.1 | The app shall open a native save dialog before downloading            | `browseSavePath()` → `dialog.showSaveDialog()`                 |
| FR-3.2 | The default save location shall be the user's Downloads folder        | `app.getPath("downloads")`                                     |
| FR-3.3 | The suggested filename shall be sanitized from the video title        | `sanitizeFilename()` removes forbidden chars, truncates to 180 |
| FR-3.4 | The file extension shall be ensured to match the selected format      | `ensureExtension()`                                            |
| FR-3.5 | The app shall spawn yt-dlp with appropriate format arguments          | `buildFormatArguments()` → `spawn()`                           |
| FR-3.6 | The app shall provide ffmpeg location to yt-dlp                       | `--ffmpeg-location` flag                                       |
| FR-3.7 | The app shall display real-time progress (percent, speed, ETA, bytes) | Progress parsed from custom template, sent as events           |
| FR-3.8 | The app shall capture the final output file path                      | `--print after_move:__FINAL_PATH__:%(filepath)s`               |
| FR-3.9 | The app shall record completed/failed/cancelled downloads to history  | `recordHistory()` after download settles                       |

### FR-4: Download Queue

| ID     | Requirement                                                             | Implementation                                       |
| ------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| FR-4.1 | Users shall be able to add downloads to a queue                         | "Add to Queue" button → `pendingDownloads` array     |
| FR-4.2 | Queued items shall display title, format, and quality                   | Rendered as `.q-card` elements                       |
| FR-4.3 | Individual queued items shall be startable                              | "Start" button per queue card                        |
| FR-4.4 | Individual queued items shall be removable                              | "Remove" button per queue card                       |
| FR-4.5 | All queued items shall be startable at once                             | "Start All" button → `Promise.allSettled()`          |
| FR-4.6 | Failed starts shall remain in queue; successful starts shall be removed | `handleStartAllQueued()` filters by rejection status |

### FR-5: Download History

| ID     | Requirement                                                     | Implementation                               |
| ------ | --------------------------------------------------------------- | -------------------------------------------- |
| FR-5.1 | History shall persist across app sessions                       | JSON file in `userData` directory            |
| FR-5.2 | History shall be loaded on app startup                          | `loadHistory()` in `app.whenReady()`         |
| FR-5.3 | New entries shall be prepended (newest first)                   | `prependHistory()`                           |
| FR-5.4 | History shall be capped at 200 entries                          | `.slice(0, 200)` in `prependHistory()`       |
| FR-5.5 | Completed history items shall be openable in file manager       | `shell.showItemInFolder()` on sidebar click  |
| FR-5.6 | History shall be clearable by the user                          | "Clear history" button → `history:clear` IPC |
| FR-5.7 | History entries shall include file size for completed downloads | `fs.stat()` on output path                   |

### FR-6: Sidebar Navigation

| ID     | Requirement                                                                 | Implementation                                             |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FR-6.1 | Sidebar shall display 4 tabs: All, Active, Queue, Completed                 | `nav.sidebar-nav` with `data-tab` buttons                  |
| FR-6.2 | Each tab shall show a live count badge                                      | `updateCounts()` updates `#countAll`, `#countActive`, etc. |
| FR-6.3 | Sidebar list shall filter items by active tab                               | `filterByTab()` function                                   |
| FR-6.4 | Sidebar items shall show thumbnail, title, format, time ago, and status dot | `.sidebar-item` rendering in `renderSidebarList()`         |
| FR-6.5 | Status dots shall be color-coded                                            | Green=completed, Red=failed, Purple=active, Amber=queued   |

### FR-7: Tool Detection

| ID     | Requirement                                         | Implementation                                     |
| ------ | --------------------------------------------------- | -------------------------------------------------- |
| FR-7.1 | The app shall detect yt-dlp availability on startup | `detectTools()` → `isBinaryAvailable()`            |
| FR-7.2 | The app shall detect ffmpeg availability on startup | Same flow with `-version` flag                     |
| FR-7.3 | Tool status shall be displayed in sidebar footer    | Green/red dots next to "yt-dlp" and "ffmpeg" pills |
| FR-7.4 | Downloads shall be blocked if yt-dlp is unavailable | `startDownload()` and `inspectUrl()` throw Error   |
| FR-7.5 | Downloads shall be blocked if ffmpeg is unavailable | `startDownload()` throws Error                     |

### FR-8: Automation Mode

| ID     | Requirement                                                        | Implementation                                         |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| FR-8.1 | Automation shall activate when AUTO_URL and AUTO_SAVE_PATH are set | `getAutomationConfig()` returns null if either missing |
| FR-8.2 | Automation shall pre-fill URL, format, quality, and save path      | `runAutomationIfConfigured()` sets UI state            |
| FR-8.3 | Automation shall optionally auto-start the download                | `AUTO_START=1` triggers `startDownload()`              |
| FR-8.4 | Automation events shall optionally log to stdout                   | `AUTOMATION_LOG=1` prints JSON events                  |

## Non-Functional Requirements

### NFR-1: Security

| ID      | Requirement                              | Status                                           |
| ------- | ---------------------------------------- | ------------------------------------------------ |
| NFR-1.1 | Context isolation must be enabled        | `contextIsolation: true` in BrowserWindow config |
| NFR-1.2 | Node integration must be disabled        | `nodeIntegration: false` in BrowserWindow config |
| NFR-1.3 | All dynamic HTML content must be escaped | `escapeHtml()` used in all innerHTML assignments |
| NFR-1.4 | Only local files shall be loaded         | `mainWindow.loadFile()` — no `loadURL()`         |
| NFR-1.5 | Preload shall expose minimal API surface | 8 methods only via `contextBridge`               |
| NFR-1.6 | Dependencies shall be audited regularly  | CI runs `pnpm audit`, Dependabot enabled         |

### NFR-2: Performance

| ID      | Requirement                                           | Status                                                      |
| ------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| NFR-2.1 | Progress updates shall be real-time (per yt-dlp line) | `--newline` flag + line-by-line parsing                     |
| NFR-2.2 | History file I/O shall not block the UI               | Async `fs/promises` throughout                              |
| NFR-2.3 | Multiple downloads shall run concurrently             | Each download is an independent child process               |
| NFR-2.4 | DOM updates shall be batched per event                | Each event triggers a single re-render of affected sections |

### NFR-3: Cross-Platform

| ID      | Requirement                                          | Status                                                   |
| ------- | ---------------------------------------------------- | -------------------------------------------------------- |
| NFR-3.1 | App shall run on macOS, Windows, and Linux           | Electron cross-platform, platform-aware binary detection |
| NFR-3.2 | Binary detection shall use platform-correct locator  | `which` on Unix, `where` on Windows                      |
| NFR-3.3 | File paths shall use platform-appropriate separators | `path.join()` used throughout                            |

### NFR-4: Code Quality

| ID      | Requirement                                   | Status                                  |
| ------- | --------------------------------------------- | --------------------------------------- |
| NFR-4.1 | All TypeScript shall pass ESLint checks       | CI enforces `pnpm lint`                 |
| NFR-4.2 | All code shall be Prettier-formatted          | CI enforces `pnpm format`               |
| NFR-4.3 | All TypeScript files shall pass type checking | CI enforces `pnpm check` (tsc --noEmit) |
| NFR-4.4 | Utility functions shall have unit tests       | 14 test suites with 52 assertions       |
| NFR-4.5 | CI shall run on Node.js 20 and 22             | Matrix strategy in `ci.yml`             |

### NFR-5: Maintainability

| ID      | Requirement                                              | Status                                      |
| ------- | -------------------------------------------------------- | ------------------------------------------- |
| NFR-5.1 | Pure logic shall be extracted to testable utility module | `lib/utils.ts` with 14 typed pure functions |
| NFR-5.2 | IPC protocol shall use namespaced channel names          | `app:*`, `downloads:*`, `history:*`         |
| NFR-5.3 | Commit messages shall follow Conventional Commits        | Enforced by `pr-checks.yml`                 |
| NFR-5.4 | Stale issues/PRs shall be auto-closed                    | `stale.yml` — 30 day inactivity             |
| NFR-5.5 | Dependencies shall be auto-updated                       | Dependabot weekly checks                    |
