# Quick Context — YouTube Video Downloader

Ultra-dense cheat sheet for AI coding agents.

## Identity

Electron desktop app for downloading YouTube videos/audio. Uses yt-dlp + ffmpeg as external tools. TypeScript (strict), compiled to dist/ via tsc. pnpm as package manager.

## Stack

TypeScript 5.9 | Electron 30+ | Node.js 20+ | pnpm 10+ | yt-dlp | ffmpeg | ESLint 10 + typescript-eslint | Prettier | node:test + tsx

## Commands

```
./application.start   Install toolchain, deps, build, and launch app
pnpm build          Compile TS to dist/ + copy static assets
pnpm start          Build + launch app
pnpm test           Run tests (tsx --test)
pnpm test:coverage  Tests + coverage
pnpm lint           ESLint check
pnpm lint:fix       ESLint auto-fix
pnpm format         Prettier check
pnpm format:fix     Prettier fix
pnpm check          Type-check (tsc --noEmit)
pnpm validate       check + lint + format
```

## Source Files

| File                  | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `main.ts`             | Electron main: window, IPC, yt-dlp spawn, history persistence                         |
| `preload.ts`          | contextBridge exposing 8 methods as `window.youtubeDownloader`                        |
| `lib/utils.ts`        | 14 pure functions: filename sanitize, format args, progress parse, labels, escapeHtml |
| `src/types.ts`        | Shared TypeScript interfaces for IPC payloads, state, API                             |
| `src/renderer.ts`     | UI state, DOM rendering, event wiring, automation                                     |
| `src/index.html`      | Three-zone layout: sidebar + workspace + status bar                                   |
| `src/styles.css`      | Dark theme, purple accent, CSS custom properties                                      |
| `tests/utils.test.ts` | 52 assertions via tsx, node:test + assert/strict                                      |

## IPC Channels

- `app:get-bootstrap` — returns `{ tools, history, automation }`
- `downloads:inspect-url` — accepts URL, returns metadata payload
- `downloads:browse-save-path` — opens native save dialog
- `downloads:start` — spawns yt-dlp, returns `{ taskId }`
- `downloads:cancel` — kills child process by taskId
- `history:open-folder` — shell.showItemInFolder
- `history:clear` — wipes history array + file
- `downloads:event` — main→renderer push (started/progress/finished/history-updated)

## Preload API (`window.youtubeDownloader`)

`getBootstrap` `inspectUrl` `browseSavePath` `startDownload` `cancelDownload` `openFolder` `clearHistory` `onDownloadEvent`

## Download Formats

- **Video**: mp4 (H.264+AAC), webm (VP9+Opus) — uses `--merge-output-format`
- **Audio**: mp3, wav — uses `--extract-audio --audio-format`
- Quality: "best" or specific height (1080/720/480) or bitrate (320/256/192/128)

## Key Patterns

- State object in renderer: `{ tools, metadata, activeDownloads: Map, pendingDownloads, history, currentSavePath, automation, activeTab, selectedFormat }`
- Main process state: `activeDownloads` Map (taskId → task with child process), `historyEntries` array, `toolStatus` object
- Progress parsed from custom `--progress-template` with pipe-delimited fields
- Output path captured via `--print after_move:__FINAL_PATH__:%(filepath)s`
- History capped at 200 entries, stored in `userData/download-history.json`

## Rules

- TypeScript `strict: true` — all functions typed, compiled to dist/ via tsc
- Always `escapeHtml()` before innerHTML — XSS prevention
- `contextIsolation: true`, `nodeIntegration: false` — Electron security
- Double quotes, semicolons, 120 char width, 2-space indent
- `const`/`let` only, strict equality (`===`), no `var`
- ESM imports compiled to CommonJS (`esModuleInterop: true`)

## Duplicated Code

renderer.ts copies 5 functions from lib/utils.ts (getDurationLabel, getFileSizeLabel, getSpeedLabel, getEtaLabel, escapeHtml) because the compiled renderer.js runs in browser context via `<script>` tag (no module system). Keep both in sync when editing.
