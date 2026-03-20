# Developer Handbook — YouTube Video Downloader

Detailed flow walkthroughs, patterns, and guides for contributors and AI agents.

## Application Lifecycle

### Startup Sequence

```
1. app.whenReady()
2. Set historyFilePath = userData + "/download-history.json"
3. ensureHistoryFile()        → create file if not exists
4. loadHistory()              → parse JSON into historyEntries
5. detectTools()              → locate yt-dlp/ffmpeg, check --version
6. createWindow()             → BrowserWindow with preload.ts
7. loadFile("src/index.html") → triggers DOMContentLoaded
8. boot() in renderer.ts:
   a. wireRefs()              → cache 30+ DOM element references
   b. renderQualityOptions()  → populate default quality dropdown
   c. syncDownloadButton()    → disable (no metadata yet)
   d. Wire 11 event listeners
   e. getBootstrap()          → IPC to main, receive tools+history+automation
   f. applyBootstrap()        → set state, render tool dots + history
   g. renderVideoCard()       → hide card (no metadata)
   h. renderPendingDownloads()→ hide queue section (empty)
   i. renderActiveDownloads() → hide active section (empty)
   j. updateCounts()          → all zeros
   k. onDownloadEvent()       → register event listener
   l. runAutomationIfConfigured() → if env vars set, auto-fill and optionally start
```

## Process Architecture

### Main Process Responsibilities

| Responsibility      | Functions                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Window management   | `createWindow()`, `app.on("activate")`, `app.on("window-all-closed")`                          |
| Tool detection      | `detectTools()`, `locateBinary()`, `isBinaryAvailable()`                                       |
| URL inspection      | `inspectUrl()` → spawns `yt-dlp --dump-single-json`                                            |
| Download management | `startDownload()`, `cancelDownload()`, `buildProgressSnapshot()`                               |
| Progress parsing    | `splitLines()`, `handleLine()` (inline), `parseProgressLine()`                                 |
| History persistence | `ensureHistoryFile()`, `loadHistory()`, `saveHistory()`, `prependHistory()`, `recordHistory()` |
| Event dispatch      | `sendDownloadEvent()` → `webContents.send("downloads:event")`                                  |
| Automation config   | `getAutomationConfig()` → reads `process.env.AUTO_*`                                           |
| File dialogs        | `dialog.showSaveDialog()` in browse-save-path handler                                          |
| Shell integration   | `shell.showItemInFolder()` in open-folder handler                                              |

### Renderer Process Responsibilities

| Responsibility    | Functions                                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State management  | `state` object, `applyBootstrap()`                                                                                                                                                                                                                    |
| DOM rendering     | `renderVideoCard()`, `renderActiveDownloads()`, `renderPendingDownloads()`, `renderSidebarList()`, `renderQualityOptions()`, `renderToolStatus()`, `updateCounts()`                                                                                   |
| User interactions | `handleAnalyze()`, `handleDownload()`, `handleQueueCurrent()`, `handlePaste()`, `handleCancelClick()`, `handleTabClick()`, `handleFormatChipClick()`, `handleSidebarClick()`, `handleQueuedClick()`, `handleStartAllQueued()`, `handleClearHistory()` |
| Download events   | `handleDownloadEvent()` — routes by `payload.type`                                                                                                                                                                                                    |
| Helpers           | `setFlashMessage()`, `clearFlashMessage()`, `buildCurrentDownloadEntry()`, `resetCurrentSavePath()`, `ensureConfiguredSavePath()`, `chooseSavePath()`, `startPendingEntry()`, `setActiveFormat()`, `getQualityOptionsForFormat()`, `timeAgo()`        |
| Duplicated utils  | `getDurationLabel()`, `getFileSizeLabel()`, `getSpeedLabel()`, `getEtaLabel()`, `escapeHtml()`                                                                                                                                                        |

## Data Flow Walkthroughs

### Flow 1: URL Analysis

```
User pastes URL → clicks Analyze (or presses Enter)
  ↓
handleAnalyze(event)
  ├── event.preventDefault()
  ├── clearFlashMessage()
  ├── Validate URL not empty
  ├── Disable analyze button, set text "Analyzing..."
  ├── await window.youtubeDownloader.inspectUrl(url)
  │     ↓ (IPC invoke)
  │   ipcMain.handle("downloads:inspect-url")
  │     ├── Check toolStatus.ytDlpAvailable
  │     ├── runCommand(ytDlpPath, ["--dump-single-json", ...])
  │     ├── JSON.parse(stdout)
  │     └── return buildMetadataPayload(url, info)
  │       ↓ (IPC response)
  ├── state.metadata = response
  ├── state.currentSavePath = ""
  ├── renderVideoCard()        → show thumbnail, title, uploader, duration
  ├── renderQualityOptions()   → populate quality dropdown for current format
  └── syncDownloadButton()     → enable button
```

### Flow 2: Download

```
User clicks "Download Now"
  ↓
handleDownload()
  ├── clearFlashMessage()
  ├── Check state.metadata exists
  ├── ensureConfiguredSavePath()
  │     ├── If no path → chooseSavePath()
  │     │     ├── browseSavePath({ suggestedFilename, format })
  │     │     │     ↓ (IPC invoke)
  │     │     │   dialog.showSaveDialog()
  │     │     │     ↓ (user picks path)
  │     │     │   ensureExtension(filePath, format)
  │     │     │     ↓ (IPC response)
  │     │     ├── state.currentSavePath = response.filePath
  │     │     └── refs.savePathInput.value = response.filePath
  │     └── Return true/false
  ├── Disable button, set text "Starting..."
  ├── buildCurrentDownloadEntry() → { id, url, title, thumbnail, format, quality, savePath }
  ├── startPendingEntry(entry)
  │     ├── window.youtubeDownloader.startDownload(payload)
  │     │     ↓ (IPC invoke)
  │     │   ipcMain.handle("downloads:start")
  │     │     ├── Check yt-dlp and ffmpeg available
  │     │     ├── Generate taskId (crypto.randomUUID)
  │     │     ├── buildFormatArguments({ format, quality })
  │     │     ├── spawn(ytDlpPath, args)
  │     │     ├── Create task object, add to activeDownloads
  │     │     ├── sendDownloadEvent({ type: "download-started", task })
  │     │     ├── Wire stdout/stderr line parsing
  │     │     ├── Wire close/error handlers
  │     │     └── return taskId
  │     │     ↓ (IPC response)
  │     └── (no-op with returned taskId)
  ├── setFlashMessage("Download started.")
  └── resetCurrentSavePath()
```

### Flow 3: Progress Updates

```
yt-dlp stdout emits line: "download:downloading|5242880|10485760|...|50.0%|1048576|5"
  ↓
splitLines(buffer, chunk, onLine)
  ├── Merge buffer + chunk
  ├── Split by newlines
  └── For each complete line → handleLine(trimmed)
        ├── Check for "__FINAL_PATH__:" prefix → update task.outputPath
        ├── Check for "ERROR:" prefix → store as lastErrorLine
        └── parseProgressLine(line)
              ├── Validate starts with "download:"
              ├── Split by "|", require 7+ parts
              └── Return { status, percent, downloadedBytes, totalBytes, speed, eta }
                    ↓
              task.status = "downloading" or "processing"
              sendDownloadEvent({ type: "download-progress", task: snapshot })
                    ↓ (webContents.send)
              handleDownloadEvent(payload) in renderer
                    ├── state.activeDownloads.set(id, task)
                    └── renderActiveDownloads()
                          ├── Render progress bar, percent, speed, ETA, bytes
                          ├── updateCounts()
                          └── renderSidebarList()
```

### Flow 4: Download Completion

```
yt-dlp process exits with code 0
  ↓
child.on("close", code)
  ├── Check task.settled (prevent double-handling)
  ├── task.settled = true
  ├── activeDownloads.delete(taskId)
  ├── finalStatus = cancelled ? "cancelled" : code===0 ? "completed" : "failed"
  ├── task.status = finalStatus
  ├── sendDownloadEvent({ type: "download-finished", task, errorMessage })
  │     ↓ (webContents.send to renderer)
  │   handleDownloadEvent(payload)
  │     ├── state.activeDownloads.delete(id)
  │     ├── renderActiveDownloads()
  │     └── setFlashMessage("Download complete!")
  └── recordHistory(task, finalStatus, errorMessage)
        ├── fs.stat(outputPath) → get fileSize
        ├── Build HistoryEntry
        ├── prependHistory(entry) → cap at 200
        └── sendDownloadEvent({ type: "history-updated", entry })
              ↓ (webContents.send to renderer)
            handleDownloadEvent(payload)
              ├── state.history = [entry, ...filtered]
              └── renderHistory()
```

### Flow 5: Cancel Download

```
User clicks "Cancel" button on active download card
  ↓
handleCancelClick(event)
  ├── Find closest [data-cancel-id] button
  ├── window.youtubeDownloader.cancelDownload(taskId)
  │     ↓ (IPC invoke)
  │   ipcMain.handle("downloads:cancel")
  │     ├── activeDownloads.get(taskId)
  │     ├── task.cancelled = true
  │     ├── task.status = "cancelled"
  │     └── task.process.kill("SIGINT")
  │           ↓ (triggers close event)
  │         child.on("close") → finalStatus = "cancelled"
  │         → sendDownloadEvent + recordHistory (see Flow 4)
  └── (renderer updates via download-finished event)
```

### Flow 6: Queue Management

```
User clicks "Add to Queue"
  ↓
handleQueueCurrent()
  ├── Check state.metadata exists
  ├── ensureConfiguredSavePath() → open save dialog if needed
  ├── buildCurrentDownloadEntry() → { id, url, title, format, quality, savePath }
  ├── state.pendingDownloads = [entry, ...existing]  (prepend)
  ├── renderPendingDownloads() → show queue section + cards
  ├── resetCurrentSavePath()
  └── setFlashMessage("Added to queue.")

User clicks "Start All"
  ↓
handleStartAllQueued()
  ├── Disable button, set text "Starting..."
  ├── Copy pendingDownloads array
  ├── Promise.allSettled(entries.map(startPendingEntry))
  ├── Collect failed IDs
  ├── state.pendingDownloads = only failed entries
  ├── renderPendingDownloads()
  └── Flash message: "All queued downloads started." or "Some failed."
```

### Flow 7: History Interaction

```
User clicks a completed sidebar item
  ↓
handleSidebarClick(event)
  ├── Find closest [data-sidebar-id] element
  ├── Check type === "history" && status === "completed" && path exists
  └── window.youtubeDownloader.openFolder(path)
        ↓ (IPC invoke)
      shell.showItemInFolder(filePath)

User clicks clear history button
  ↓
handleClearHistory()
  ├── window.youtubeDownloader.clearHistory()
  │     ↓ (IPC invoke)
  │   historyEntries = []
  │   saveHistory() → write "[]" to JSON file
  ├── state.history = []
  └── renderHistory()
```

## State Management Details

### Main Process State

| Variable          | Type          | Lifetime     | Purpose                               |
| ----------------- | ------------- | ------------ | ------------------------------------- |
| `mainWindow`      | BrowserWindow | App lifetime | Single window reference               |
| `historyFilePath` | string        | App lifetime | Absolute path to JSON file            |
| `historyEntries`  | Array         | App lifetime | In-memory history cache               |
| `toolStatus`      | Object        | App lifetime | Detected binary status                |
| `activeDownloads` | Map           | Per-download | Maps taskId → Task with child process |

### Renderer Process State

| Property           | Type         | Default | Updated By                                                              |
| ------------------ | ------------ | ------- | ----------------------------------------------------------------------- |
| `tools`            | Object\|null | null    | `applyBootstrap()`                                                      |
| `metadata`         | Object\|null | null    | `handleAnalyze()`                                                       |
| `activeDownloads`  | Map          | empty   | `handleDownloadEvent()`                                                 |
| `pendingDownloads` | Array        | []      | `handleQueueCurrent()`, `handleQueuedClick()`, `handleStartAllQueued()` |
| `history`          | Array        | []      | `applyBootstrap()`, `handleDownloadEvent()`, `handleClearHistory()`     |
| `currentSavePath`  | string       | ""      | `chooseSavePath()`, `resetCurrentSavePath()`                            |
| `automation`       | Object\|null | null    | `applyBootstrap()`                                                      |
| `activeTab`        | string       | "all"   | `handleTabClick()`                                                      |
| `selectedFormat`   | string       | "mp4"   | `setActiveFormat()`                                                     |

### Refs Object

The `refs` object caches 30+ DOM element references, wired in `wireRefs()` on boot. All use `document.getElementById()` except `refs.sidebarNav` which uses `document.querySelector(".sidebar-nav")`.

## Error Handling Patterns

### IPC Errors

- Main process handlers throw errors that propagate through `ipcRenderer.invoke()` as rejected promises
- Renderer catches in try/catch and calls `setFlashMessage(error.message, "error")`

### Child Process Errors

- `child.on("error")` — spawn failure (e.g., binary not found)
- `child.on("close", nonZeroCode)` — yt-dlp reported an error
- Both guarded by `task.settled` flag to prevent double-handling
- Error message sourced from: last `ERROR:` line > stderr > generic exit code message

### UI Flash Messages

- `setFlashMessage(message, type)` — sets text + class on `#flashMessage`
- `clearFlashMessage()` — hides the flash element
- Types: `"success"` (green) or `"error"` (red)
- Flash is cleared at the start of each user action

## UI Architecture

### Three-Zone Layout

```
┌──────────────┬────────────────────────────────────────┐
│              │  Action Bar (URL input + Analyze)       │ ← fixed height 64px
│   Sidebar    ├────────────────────────────────────────┤
│   (260px)    │  Flash Message (success/error)          │ ← conditional
│              ├────────────────────────────────────────┤
│  - Brand     │                                        │
│  - Nav tabs  │  Content Scroll (scrollable)            │
│  - List      │  - Empty State / Video Card             │
│  - Footer    │  - Active Downloads                     │
│              │  - Download Queue                       │
│              ├────────────────────────────────────────┤
│              │  Status Bar (counts + version)           │ ← fixed height 32px
└──────────────┴────────────────────────────────────────┘
```

### Rendering Pattern

All UI updates follow the same pattern:

1. Update `state` property
2. Call the relevant `render*()` function
3. Render function reads from `state` and writes to DOM via `innerHTML` or `textContent`
4. All dynamic values passed through `escapeHtml()` before HTML insertion
5. Cross-cutting updates: `updateCounts()` and `renderSidebarList()` called after most renders

### Tab System

- 4 tabs in sidebar: All, Active, Queue, Completed
- `state.activeTab` stores current selection
- `filterByTab(items)` applies tab filter to the unified item list
- `buildSidebarItems()` combines active downloads + queue + history into one array
- Tab click: update `state.activeTab` → toggle `.active` class → `renderSidebarList()`

### Format Chips

- 4 chip buttons: MP4, WEBM, MP3, WAV
- Delegated click handler on `#formatChips` container
- Click: `setActiveFormat(format)` → toggle `.active` class → `renderQualityOptions()` → clear save path

## CSS Architecture

### Custom Properties

50+ CSS custom properties defined on `:root`:

- **Colors**: `--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-hover`, `--bg-input`
- **Borders**: `--border`, `--border-subtle`, `--border-focus`
- **Text**: `--text-1` (primary), `--text-2` (secondary), `--text-3` (muted)
- **Accent**: `--accent` (#7c65f6), `--accent-hover`, `--accent-subtle`, `--accent-glow`
- **Status**: `--green`, `--red`, `--amber`, `--blue` (each with `*-bg` variant)
- **Layout**: `--sidebar-w` (260px), `--action-bar-h` (64px), `--status-bar-h` (32px)
- **Radius**: `--r-xs` through `--r-xl` (4px to 16px)
- **Fonts**: `--font` (system stack), `--mono` (SF Mono stack)

### Responsive Breakpoints

- `<= 900px`: Sidebar narrows to 220px, option row stacks vertically
- `<= 640px`: Sidebar hidden, action buttons stack, features column

### Status Color Mapping

| Status                          | Color Variable | Usage                        |
| ------------------------------- | -------------- | ---------------------------- |
| completed                       | `--green`      | Sidebar dot, tag             |
| failed                          | `--red`        | Sidebar dot, tag             |
| cancelled                       | `--text-3`     | Sidebar dot; `--red` for tag |
| downloading/processing/starting | `--accent`     | Sidebar dot (pulsing), tag   |
| queued                          | `--amber`      | Sidebar dot                  |

## Adding a New Feature

Step-by-step guide for adding a new feature:

1. **Identify the process**: Does it need Node.js? → main.ts. UI only? → renderer.ts. Both? → IPC.
2. **Add utility functions** to `lib/utils.ts` if pure logic is involved. Add tests.
3. **Add IPC channel** if main process involvement needed (see next section).
4. **Update preload.ts** to expose new method via `contextBridge`.
5. **Update renderer.ts**: add state properties, handler functions, render functions.
6. **Update index.html** if new UI elements needed. Add IDs for DOM references.
7. **Update styles.css** for styling.
8. **Wire refs** in `wireRefs()` for new DOM elements.
9. **Wire events** in `boot()` for new event listeners.
10. **Run `pnpm validate`** to ensure lint/format/syntax pass.
11. **Run `pnpm test`** to ensure existing tests pass.

## Adding a New IPC Channel

1. **Choose a channel name** following namespace convention: `domain:action`
   - Domains: `app`, `downloads`, `history`, or introduce a new one
   - Action: verb describing the operation

2. **Add handler in main.ts**:

   ```ts
   ipcMain.handle("domain:action", async (_, payload: YourPayloadType) => {
     // Implementation
     return result;
   });
   ```

3. **Add types in src/types.ts** for the new payload/response shapes.

4. **Add method in preload.ts**:

   ```ts
   actionName(payload: YourPayloadType): Promise<YourResponseType> {
     return ipcRenderer.invoke("domain:action", payload);
   }
   ```

5. **Update `YoutubeDownloaderAPI` interface** in `src/types.ts`.

6. **Call from renderer.ts**:

   ```ts
   const result = await window.youtubeDownloader.actionName(payload);
   ```

7. **For push events** (main → renderer), use the existing `downloads:event` channel:

   ```ts
   // In main.ts
   sendDownloadEvent({ type: "your-event-type", data });

   // In renderer.ts handleDownloadEvent()
   if (payload.type === "your-event-type") {
     /* handle */
   }
   ```
