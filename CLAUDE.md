# CLAUDE.md — YouTube Video Downloader

Electron desktop app that downloads YouTube videos/audio via yt-dlp + ffmpeg.
Stack: Electron (main/preload/renderer), TypeScript, yt-dlp, ffmpeg, pnpm.

## Build & Run

```bash
pnpm install          # Install deps (Electron, TypeScript, ESLint, Prettier)
pnpm build            # Compile TS to dist/ and copy static assets
pnpm start            # Build + launch Electron app
pnpm dev              # Same as start (alias)
pnpm test             # tsx --test tests/*.test.ts
pnpm test:coverage    # Tests with --experimental-test-coverage
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier check
pnpm format:fix       # Prettier auto-fix
pnpm check            # tsc --noEmit (type check without emitting)
pnpm validate         # check + lint + format (CI gate)
```

## File Map

| File                             | Lines | Role                                                                        |
| -------------------------------- | ----- | --------------------------------------------------------------------------- |
| `main.ts`                        | ~480  | Electron main process: window, IPC handlers, yt-dlp spawning, history       |
| `preload.ts`                     | ~42   | contextBridge exposing `window.youtubeDownloader` (8 methods)               |
| `lib/utils.ts`                   | ~195  | Pure functions: format args, progress parsing, metadata, labels, escapeHtml |
| `lib/main-helpers.ts`            | ~75   | Extracted pure functions from main: automation config, splitLines, progress |
| `lib/renderer-helpers.ts`        | ~155  | Extracted pure functions from renderer: color, sidebar, quality, timeAgo    |
| `src/types.ts`                   | ~159  | Shared TypeScript interfaces for IPC payloads, state, and API               |
| `src/renderer.ts`                | ~890  | UI state management, DOM rendering, event handlers                          |
| `src/index.html`                 | ~362  | Three-zone layout: sidebar + workspace + status bar                         |
| `src/styles.css`                 | ~1277 | Dark theme, purple accent (#7c65f6), CSS custom properties                  |
| `tests/utils.test.ts`            | ~380  | 64 assertions covering all 14 utils exports                                 |
| `tests/main.test.ts`             | ~185  | 22 assertions: automation config, splitLines, buildProgressSnapshot         |
| `tests/renderer-helpers.test.ts` | ~400  | 46 assertions: color, sidebar, quality, timeAgo, YouTube ID                 |
| `scripts/copy-static.js`         | ~12   | Copies index.html + styles.css to dist/src/                                 |

## Architecture

```
renderer.ts  --IPC invoke-->  preload.ts  --contextBridge-->  main.ts  --spawn-->  yt-dlp
     ^                                                            |                   |
     |_____________________  downloads:event  ____________________|                   |
                            (webContents.send)                         uses ffmpeg <---|
```

TypeScript compiles to `dist/` via `tsc`. Electron loads `dist/main.js` as entry point.
Static assets (HTML, CSS) are copied to `dist/src/` by `scripts/copy-static.js`.

## IPC Protocol

| Channel                      | Direction            | Request                                     | Response                         |
| ---------------------------- | -------------------- | ------------------------------------------- | -------------------------------- |
| `app:get-bootstrap`          | invoke               | —                                           | `{ tools, history, automation }` |
| `downloads:inspect-url`      | invoke               | `url: string`                               | MetadataPayload                  |
| `downloads:browse-save-path` | invoke               | `{ suggestedFilename, format }`             | `{ filePath }` or `null`         |
| `downloads:start`            | invoke               | `{ url, title, format, quality, savePath }` | `{ taskId }`                     |
| `downloads:cancel`           | invoke               | `taskId: string`                            | `boolean`                        |
| `history:open-folder`        | invoke               | `filePath: string`                          | `true`                           |
| `history:clear`              | invoke               | —                                           | `true`                           |
| `downloads:event`            | send (main→renderer) | —                                           | `{ type, task, errorMessage? }`  |

Event types: `download-started`, `download-progress`, `download-finished`, `history-updated`.

## Preload API (`window.youtubeDownloader`)

`getBootstrap()`, `inspectUrl(url)`, `browseSavePath(payload)`, `startDownload(payload)`,
`cancelDownload(taskId)`, `openFolder(filePath)`, `clearHistory()`, `onDownloadEvent(callback)`.

Typed via `YoutubeDownloaderAPI` interface in `src/types.ts`.

## Renderer State

```ts
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
```

## Type Definitions (src/types.ts)

All shared interfaces: `ToolStatus`, `MetadataPayload`, `QualityOption`, `ProgressSnapshot`,
`ProgressData`, `HistoryEntry`, `DownloadTask`, `AutomationConfig`, `BootstrapPayload`,
`DownloadEvent`, `BrowseSavePathPayload`, `StartDownloadPayload`, `FormatFilter`,
`FormatArgInput`, `YtDlpFormat`, `YtDlpInfo`, `YoutubeDownloaderAPI`.

## Utils Exports (lib/utils.ts)

`sanitizeFilename`, `ensureExtension`, `formatFilterFor`, `toUniqueSortedNumbers`,
`extractVideoQualities`, `extractAudioQualities`, `buildFormatArguments`,
`parseProgressLine`, `buildMetadataPayload`, `getDurationLabel`, `getFileSizeLabel`,
`getSpeedLabel`, `getEtaLabel`, `escapeHtml`.

Main process imports: first 6 (sanitize through buildMetadataPayload).
Renderer duplicates: last 5 (getDurationLabel through escapeHtml) — tsc compiles renderer.ts
to a browser-loaded script with no module system, so it can't import from lib/utils.

## Key Conventions

- **Language**: TypeScript with `strict: true`
- **Module system**: ESM-style imports compiled to CommonJS (`esModuleInterop: true`)
- **Compilation**: `tsc` to `dist/`, no bundler
- **Quotes**: Double quotes (Prettier: `singleQuote: false`)
- **Semicolons**: Always (Prettier: `semi: true`)
- **Print width**: 120 chars
- **Equality**: Strict only (`eqeqeq: ["error", "always"]`)
- **Variables**: `const`/`let` only, no `var` (ESLint: `no-var: "error"`)
- **XSS**: All dynamic HTML must use `escapeHtml()` — never innerHTML raw user data
- **Security**: `contextIsolation: true`, `nodeIntegration: false`

## Testing

Framework: `node:test` + `node:assert/strict` (zero deps). Runner: `tsx` (esbuild-based).
Test files: `tests/utils.test.ts`, `tests/main.test.ts`, `tests/renderer-helpers.test.ts`.
132 assertions across 29 test suites covering utils, main-helpers, and renderer-helpers.

## Automation Mode

Set env vars to pre-fill UI and auto-start downloads:

```bash
AUTO_URL="https://youtube.com/..." AUTO_SAVE_PATH="/out.mp4" AUTO_FORMAT="mp4" \
AUTO_QUALITY="1080" AUTO_START="1" AUTOMATION_LOG="1" pnpm start
```

`AUTOMATION_LOG=1` prints `AUTOMATION_EVENT {json}` to stdout for each download event.

## Specialized Agents

This project includes 14 specialized AI agent definitions in `.claude/agents/`. Each agent has deep project-specific context and enforces best practices for its domain.

| Agent | Path | Purpose |
|-------|------|---------|
| project-owner | `.claude/agents/project-owner/` | Audits and updates all agents when the project changes |
| coder | `.claude/agents/coder/` | Feature development across main/preload/renderer |
| security-auditor | `.claude/agents/security-auditor/` | XSS, shell injection, Electron hardening |
| performance | `.claude/agents/performance/` | Download speed, DOM optimization, memory |
| standards-enforcer | `.claude/agents/standards-enforcer/` | TypeScript strict, ESLint, Prettier |
| reviewer | `.claude/agents/reviewer/` | IPC contract safety, breaking changes |
| tester | `.claude/agents/tester/` | node:test framework, 132 assertions |
| architect | `.claude/agents/architect/` | System design, module boundaries |
| devops | `.claude/agents/devops/` | CI/CD workflows, release process |
| code-analyzer | `.claude/agents/code-analyzer/` | Complexity metrics, duplication, tech debt |
| planner | `.claude/agents/planner/` | Task decomposition across Electron layers |
| production-validator | `.claude/agents/production-validator/` | No TODOs/debug, Electron security check |
| release-manager | `.claude/agents/release-manager/` | Semver, changelog, Electron releases |
| issue-tracker | `.claude/agents/issue-tracker/` | GitHub labels, triage rules |

## Gotchas

1. **Duplicated utils** — renderer.ts duplicates 5 functions from lib/utils.ts (getDurationLabel, getFileSizeLabel, getSpeedLabel, getEtaLabel, escapeHtml) because lib/utils.ts imports Node's `path` module. Other pure functions are extracted into `lib/renderer-helpers.ts` and imported via ESM (`<script type="module">`).
2. **Build before run** — `pnpm start` runs `pnpm build` first. The app loads from `dist/`, not source.
3. **History cap** — `prependHistory` caps at 200 entries (`.slice(0, 200)`).
4. **activeDownloads not shared** — main process and renderer each have their own `activeDownloads` Map. Main tracks child processes; renderer tracks UI state from events.
5. **Format args** — `buildFormatArguments` handles 4 formats: mp4/webm (video) and mp3/wav (audio). Audio uses `--extract-audio`; video uses `--merge-output-format`.
6. **Progress template** — yt-dlp progress is parsed from a custom `--progress-template` with pipe-delimited fields.
7. **FINAL_PATH** — The actual output file path is captured via `--print after_move:__FINAL_PATH__:%(filepath)s`.
8. **ESLint** — Uses `typescript-eslint` with flat config in `eslint.config.mjs`. Renderer gets browser globals; all other files get Node globals.
9. **dist/ is gitignored** — compiled output is not committed. Always run `pnpm build` after cloning.
