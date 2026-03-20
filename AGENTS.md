# AGENTS.md — YouTube Video Downloader

Universal context file for AI coding agents (Claude Code, Codex, Cursor, Copilot, etc.).

## Quick Facts

| Key                 | Value                                                  |
| ------------------- | ------------------------------------------------------ |
| **App**             | Electron desktop YouTube downloader                    |
| **External tools**  | yt-dlp (video extraction), ffmpeg (merge/convert)      |
| **Language**        | TypeScript (`strict: true`, compiles to `dist/`)       |
| **Module system**   | ESM imports → CommonJS output (`esModuleInterop`)      |
| **Node.js**         | 20+                                                    |
| **Package manager** | pnpm 10+ (`corepack enable`)                           |
| **Electron**        | 30+                                                    |
| **Testing**         | `node:test` + `node:assert/strict` via `tsx` runner    |
| **Linting**         | ESLint 10 + `typescript-eslint` flat config + Prettier |
| **CI/CD**           | 6 GitHub Actions workflows                             |
| **License**         | MIT                                                    |

## Getting Started

```bash
git clone https://github.com/rishat5081/youtube-video-downloader.git
cd youtube-video-downloader
corepack enable
pnpm install
pnpm build        # Compile TypeScript + copy static assets
pnpm start        # Build + launch the app
pnpm validate     # Run all checks (typecheck + lint + format)
pnpm test         # Run unit tests (via tsx)
```

External dependencies: install `yt-dlp` and `ffmpeg` and ensure both are in PATH.

## Full Project Structure

```
youtube-video-downloader/
├── main.ts                     # Electron main process (~310 lines)
│                                 Window management, IPC handlers, yt-dlp spawning,
│                                 download progress tracking, history persistence
├── preload.ts                  # Preload script (~42 lines)
│                                 contextBridge exposing window.youtubeDownloader
├── lib/
│   └── utils.ts                # Pure utility functions (~180 lines)
│                                 14 exported functions: sanitize, format, parse, label
├── src/
│   ├── types.ts                # Shared TypeScript interfaces (~130 lines)
│   │                             IPC payloads, state types, API interface
│   ├── index.html              # Application UI (362 lines)
│   │                             Three-zone layout: sidebar + workspace + status bar
│   ├── styles.css              # Dark theme stylesheet (1277 lines)
│   │                             CSS custom properties, purple accent, responsive
│   └── renderer.ts             # Renderer process logic (~700 lines)
│                                 State management, DOM rendering, event handlers
├── tests/
│   └── utils.test.ts           # Unit tests (~356 lines)
│                                 52 assertions across 14 test suites
├── scripts/
│   └── copy-static.js          # Copies HTML/CSS to dist/src/
├── dist/                       # Compiled output (gitignored)
├── tsconfig.json               # TypeScript compiler config (strict, ES2022, CommonJS)
├── tsconfig.test.json          # Extends base, includes tests/
├── package.json                # pnpm project config, 12 scripts
├── eslint.config.mjs           # ESLint 10 + typescript-eslint flat config
├── .prettierrc                 # Double quotes, semi, 120 width, trailing comma none
├── .editorconfig               # 2-space indent, LF, UTF-8
├── .nvmrc                      # Node version pin
├── .npmrc                      # pnpm config
├── .node-version               # Node version for version managers
├── .gitignore                  # node_modules, dist, coverage, OS files
├── CONTRIBUTING.md             # Dev workflow, conventions, PR process
├── README.md                   # Full project documentation with Mermaid diagrams
├── LICENSE                     # MIT
├── CLAUDE.md                   # Claude Code agent context
├── docs/
│   ├── ARCHITECTURE.md         # Technical architecture and type definitions
│   ├── HANDBOOK.md             # Developer handbook with flow walkthroughs
│   ├── REQUIREMENTS.md         # Functional and non-functional requirements
│   └── CONTEXT.md              # Ultra-dense quick-reference cheat sheet
└── .github/
    ├── workflows/
    │   ├── ci.yml              # Lint + Format + TypeCheck + Test (Node 20+22 matrix)
    │   ├── code-quality.yml    # Security audit, license check, coverage
    │   ├── dependency-review.yml # PR dependency vulnerability scan
    │   ├── pr-checks.yml       # Conventional commit title validation
    │   ├── release.yml         # Tag-based GitHub Release creation
    │   └── stale.yml           # Auto-close stale issues/PRs (30d)
    ├── ISSUE_TEMPLATE/
    │   ├── bug_report.yml      # Bug report form
    │   └── feature_request.yml # Feature request form
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CODEOWNERS
    ├── SECURITY.md             # Vulnerability disclosure policy
    └── dependabot.yml          # Weekly npm + GitHub Actions updates
```

## Architecture

### Process Model

```
┌─────────────────┐     IPC invoke      ┌──────────────┐     spawn     ┌─────────┐
│  Renderer        │ ──────────────────► │  Main         │ ───────────► │  yt-dlp │
│  (src/renderer.ts│ ◄────────────────── │  (main.ts)    │              │         │
│   + index.html)  │   downloads:event   │               │              │  uses   │
│                  │     (push)          │  lib/utils.ts │              │ ffmpeg  │
└─────────────────┘                     └──────────────┘              └─────────┘
        │                                       │
        │ window.youtubeDownloader              │ fs read/write
        ▼                                       ▼
┌─────────────────┐                     ┌──────────────┐
│  Preload Bridge  │                     │  History JSON │
│  (preload.ts)    │                     │  (userData)   │
└─────────────────┘                     └──────────────┘

TypeScript compiles to dist/ via tsc. Electron loads dist/main.js.
Static assets (HTML, CSS) are copied to dist/src/ by scripts/copy-static.js.
```

### Security Model

- `contextIsolation: true` — renderer has no direct Node.js access
- `nodeIntegration: false` — all Node access goes through preload bridge
- `contextBridge.exposeInMainWorld` — only 8 methods exposed
- All HTML output uses `escapeHtml()` — prevents XSS
- App loads only local files — no remote content

## IPC Channel Reference

### Invoke Channels (renderer → main, request/response)

#### `app:get-bootstrap`

- **Request**: none
- **Response**: `{ tools: ToolStatus, history: HistoryEntry[], automation: AutomationConfig | null }`

#### `downloads:inspect-url`

- **Request**: `url: string`
- **Response**: `MetadataPayload` (title, uploader, duration, thumbnail, qualities)

#### `downloads:browse-save-path`

- **Request**: `{ suggestedFilename: string, format: string }`
- **Response**: `{ filePath: string } | null` (null if user cancels)

#### `downloads:start`

- **Request**: `{ url: string, title: string, format: string, quality: string, savePath: string }`
- **Response**: `{ taskId: string }` (UUID)

#### `downloads:cancel`

- **Request**: `taskId: string`
- **Response**: `boolean`

#### `history:open-folder`

- **Request**: `filePath: string`
- **Response**: `true`

#### `history:clear`

- **Request**: none
- **Response**: `true`

### Event Channel (main → renderer, push)

#### `downloads:event`

Payload shape: `{ type: string, task?: ProgressSnapshot, entry?: HistoryEntry, errorMessage?: string }`

Event types:

- `download-started` — new download spawned, includes initial task snapshot
- `download-progress` — progress update with percent, speed, ETA, bytes
- `download-finished` — download completed/failed/cancelled
- `history-updated` — new history entry added

## Preload API Reference

All methods available on `window.youtubeDownloader`:

| Method            | Signature                                  | Maps to IPC Channel          |
| ----------------- | ------------------------------------------ | ---------------------------- |
| `getBootstrap`    | `() → Promise<BootstrapPayload>`           | `app:get-bootstrap`          |
| `inspectUrl`      | `(url: string) → Promise<MetadataPayload>` | `downloads:inspect-url`      |
| `browseSavePath`  | `(payload) → Promise<{filePath} \| null>`  | `downloads:browse-save-path` |
| `startDownload`   | `(payload) → Promise<{taskId}>`            | `downloads:start`            |
| `cancelDownload`  | `(taskId: string) → Promise<boolean>`      | `downloads:cancel`           |
| `openFolder`      | `(filePath: string) → Promise<true>`       | `history:open-folder`        |
| `clearHistory`    | `() → Promise<true>`                       | `history:clear`              |
| `onDownloadEvent` | `(callback) → unsubscribe fn`              | `downloads:event` (listener) |

## State Management

### Main Process State

```ts
activeDownloads: Map<string, DownloadTask>  // tracks child processes
historyEntries: HistoryEntry[]              // loaded from JSON file
toolStatus: ToolStatus                      // detected binary status
mainWindow: BrowserWindow | null            // the single app window
historyFilePath: string                     // resolved path in userData directory
```

### Renderer Process State

```ts
const state: State = {
  tools: null, // ToolStatus from bootstrap
  metadata: null, // MetadataPayload from URL inspection
  activeDownloads: new Map(), // taskId → ProgressSnapshot (from events)
  pendingDownloads: [], // PendingEntry[] — queued items
  history: [], // HistoryEntry[] from bootstrap + live updates
  currentSavePath: "", // User-selected save path
  automation: null, // AutomationConfig from bootstrap
  activeTab: "all", // "all" | "active" | "queued" | "completed"
  selectedFormat: "mp4" // "mp4" | "webm" | "mp3" | "wav"
};
```

## Utility Functions (lib/utils.ts)

| Function                                    | Purpose                                                  |
| ------------------------------------------- | -------------------------------------------------------- |
| `sanitizeFilename(value)`                   | Remove forbidden chars, collapse spaces, truncate to 180 |
| `ensureExtension(filePath, ext)`            | Append extension if missing or different                 |
| `formatFilterFor(extension)`                | Build `{ name, extensions }` for save dialog filter      |
| `toUniqueSortedNumbers(values)`             | Dedupe, filter positive finite, sort descending          |
| `extractVideoQualities(formats, ext)`       | Extract available resolutions from yt-dlp format list    |
| `extractAudioQualities(formats)`            | Extract available bitrates from yt-dlp format list       |
| `buildFormatArguments({ format, quality })` | Build yt-dlp CLI args for format selection               |
| `parseProgressLine(line)`                   | Parse custom progress template into structured data      |
| `buildMetadataPayload(url, info)`           | Transform yt-dlp JSON dump into app metadata shape       |
| `getDurationLabel(seconds)`                 | Format seconds as `HH:MM:SS` or `MM:SS`                  |
| `getFileSizeLabel(bytes)`                   | Format bytes as human-readable (`1.5 KB`, `10.0 MB`)     |
| `getSpeedLabel(bps)`                        | Format bytes/sec as speed label or `---`                 |
| `getEtaLabel(seconds)`                      | Format ETA as `1m 30s`, `30s`, `finishing`, or `---`     |
| `escapeHtml(value)`                         | Escape `& < > " '` for safe HTML insertion               |

**Import split**: main.ts imports the first 6 functions. renderer.ts duplicates the last 5 (getDurationLabel through escapeHtml) because the compiled renderer.js runs in browser context via `<script>` tag (no module system).

## Code Style & Linting

### ESLint (`eslint.config.mjs`)

- Flat config with `typescript-eslint`, ES2024
- Node globals for all .ts files; browser globals + `crypto: readonly` for renderer.ts
- Key rules: `eqeqeq: always`, `no-var: error`, `prefer-const: warn`, `@typescript-eslint/no-unused-vars: warn`
- Ignored: `node_modules/`, `dist/`, `downloads/`, `coverage/`, `**/*.js`, `**/*.mjs`

### Prettier (`.prettierrc`)

- Double quotes, semicolons, 2-space indent
- 120 char print width, trailing comma: none
- Arrow parens: always, bracket spacing: true, LF line endings

### EditorConfig

- 2-space indent, LF, UTF-8, trim trailing whitespace (except .md)

## Testing

- **Framework**: `node:test` (built-in, zero dependencies)
- **Assertions**: `node:assert/strict`
- **Runner**: `tsx` (esbuild-based, runs .ts files directly)
- **Test file**: `tests/utils.test.ts`
- **Test count**: 14 describe blocks, 52 assertions
- **Coverage**: `pnpm test:coverage` (experimental flag) — 100% line, 100% function coverage
- **What's tested**: All 14 functions exported from `lib/utils.ts`
- **What's NOT tested**: main.ts IPC handlers, renderer.ts DOM logic, preload.ts (require Electron runtime)

## CI/CD Workflows

| Workflow          | File                    | Trigger              | Jobs                                                                      |
| ----------------- | ----------------------- | -------------------- | ------------------------------------------------------------------------- |
| CI                | `ci.yml`                | Push to main, PRs    | Lint, Format, TypeScript check, Tests (Node 20+22 matrix), Security audit |
| Code Quality      | `code-quality.yml`      | PRs, Weekly schedule | Security audit, License compliance, Test coverage                         |
| Dependency Review | `dependency-review.yml` | PRs                  | Vulnerability scanning, License validation                                |
| PR Checks         | `pr-checks.yml`         | PRs                  | Conventional commit title validation                                      |
| Release           | `release.yml`           | Tag `v*`             | Validate, Create GitHub Release with auto notes                           |
| Stale             | `stale.yml`             | Daily cron           | Auto-close stale issues (30d) and PRs (30d)                               |

## Commit Conventions & Branch Naming

**Commits**: [Conventional Commits](https://conventionalcommits.org/) — enforced by PR Checks workflow.

```
feat: add playlist download support
fix: resolve progress bar not updating
docs: update installation instructions
test: add tests for parseProgressLine
refactor: extract utility functions
ci: add dependency review workflow
```

**Branches**: prefix with type.

```
feat/playlist-support
fix/progress-bar-stuck
docs/update-readme
refactor/extract-utils
ci/add-coverage
test/add-metadata-tests
```

## Automation / Headless Mode

Environment variables to pre-fill the UI and optionally auto-start:

| Variable         | Description                                      | Default |
| ---------------- | ------------------------------------------------ | ------- |
| `AUTO_URL`       | YouTube video URL (required for automation)      | —       |
| `AUTO_SAVE_PATH` | Output file path (required for automation)       | —       |
| `AUTO_FORMAT`    | `mp4` / `webm` / `mp3` / `wav`                   | `mp4`   |
| `AUTO_QUALITY`   | `best` / `1080` / `720` / `480` / bitrate        | `best`  |
| `AUTO_START`     | `1` to auto-start download                       | `0`     |
| `AUTOMATION_LOG` | `1` to print `AUTOMATION_EVENT {json}` to stdout | `0`     |

Both `AUTO_URL` and `AUTO_SAVE_PATH` must be set for automation to activate.

## Security Rules

1. **Never disable** `contextIsolation` or enable `nodeIntegration`
2. **Always** use `escapeHtml()` before inserting user data into HTML
3. **Never** expose Node.js APIs beyond the 8 preload methods
4. **Validate** IPC payloads in main process before acting
5. **No remote content** — app loads only local files via `loadFile()`
6. Dependencies are audited via CI (`pnpm audit`) and Dependabot

## Known Limitations / Technical Debt

1. **Duplicated utility functions** — 5 functions are copied in renderer.ts because the compiled renderer.js runs in browser context with no module system. Any change to these in lib/utils.ts must be manually synced.
2. **Build required** — `dist/` is gitignored; always run `pnpm build` after cloning or pulling.
3. **No concurrent download limit** — all queued downloads start at once with "Start All"; no throttling.
4. **No playlist support** — `--no-playlist` flag is hardcoded; only single videos supported.
5. **No auto-update** — the app has no self-update mechanism; users must update manually.
6. **No persistent renderer state** — queue (`pendingDownloads`) is lost on window refresh/restart.
7. **History file growth** — capped at 200 entries but no cleanup of orphaned file references.
8. **renderer.ts is a single file** — all UI logic in one ~700-line file; no component splitting.
