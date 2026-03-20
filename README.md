# YouTube Video Downloader

A professional, cross-platform desktop application for downloading YouTube videos and audio. Built with **Electron** and **yt-dlp**, featuring a competitor-level dark UI inspired by FDM, IDM, and 4K Video Downloader — with real-time progress tracking, download queue management, and persistent history.

[![CI](https://github.com/rishat5081/youtube-video-downloader/actions/workflows/ci.yml/badge.svg)](https://github.com/rishat5081/youtube-video-downloader/actions/workflows/ci.yml)
[![Code Quality](https://github.com/rishat5081/youtube-video-downloader/actions/workflows/code-quality.yml/badge.svg)](https://github.com/rishat5081/youtube-video-downloader/actions/workflows/code-quality.yml)
![Electron](https://img.shields.io/badge/Electron-30+-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Node](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

| Category            | Features                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Download Engine** | Multi-format (MP4, WEBM, MP3, WAV), quality selection, real-time progress with speed & ETA     |
| **Queue System**    | Batch queue, start all, individual start/remove, concurrent downloads                          |
| **Smart UI**        | Three-zone layout, format toggle chips, clipboard paste, sidebar navigation with status tabs   |
| **History**         | Persistent across sessions, filterable by status (All/Active/Queue/Completed), max 200 entries |
| **Automation**      | Environment variable support for scripting and CI/CD pipelines                                 |
| **Security**        | Context isolation, no node integration, XSS-escaped output, local files only                   |

## UI Design

The interface follows a **three-zone layout** inspired by professional download managers:

- **Sidebar** — Navigation tabs (All / Active / Queue / Completed) with live counts, download list with thumbnails and status indicators, tool status pills
- **Action Bar** — URL input with clipboard paste button and Analyze trigger
- **Main Content** — Video preview card with format chips, quality selector, download/queue actions, active download progress cards

### Color System

| Element      | Color                             | Usage                                                 |
| ------------ | --------------------------------- | ----------------------------------------------------- |
| **Accent**   | `#7c65f6` (Purple)                | Buttons, progress bars, active states, brand identity |
| **Base**     | `#0c0c10`                         | Background                                            |
| **Surface**  | `#131318`                         | Cards, sidebar, panels                                |
| **Elevated** | `#1a1a22`                         | Inputs, chips, hover states                           |
| **Text**     | `#f0f0f4` / `#9d9db0` / `#5c5c70` | Primary / Secondary / Muted                           |

## Prerequisites

| Tool        | Version | Purpose                | Install                                               |
| ----------- | ------- | ---------------------- | ----------------------------------------------------- |
| **Node.js** | 20+     | Runtime                | [nodejs.org](https://nodejs.org)                      |
| **pnpm**    | 10+     | Package manager        | `corepack enable`                                     |
| **yt-dlp**  | Latest  | Video extraction       | [github.com/yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| **ffmpeg**  | Latest  | Audio/video processing | [ffmpeg.org](https://ffmpeg.org)                      |

### Quick Install

```bash
# macOS
brew install yt-dlp ffmpeg

# Windows
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg

# Ubuntu/Debian
sudo apt install ffmpeg && pip install yt-dlp

# Arch
sudo pacman -S yt-dlp ffmpeg
```

## Installation

```bash
# Clone the repository
git clone https://github.com/rishat5081/youtube-video-downloader.git
cd youtube-video-downloader

# Enable corepack (for pnpm)
corepack enable

# Install dependencies
pnpm install

# Start the application
pnpm start
```

## Usage

### Basic Workflow

1. **Paste URL** — Paste a YouTube URL into the action bar (or click the clipboard button)
2. **Analyze** — Hit Enter or click Analyze to fetch video metadata
3. **Choose Format** — Click format chips: MP4, WEBM, MP3, or WAV
4. **Select Quality** — Pick resolution or audio bitrate from the dropdown
5. **Download** — Click "Download Now" or "Add to Queue" for batch processing

### Queue Management

- **Add to Queue** — Configure and click "Add to Queue" to batch items
- **Start All** — Launch all queued downloads concurrently
- **Sidebar Tabs** — Filter by All, Active, Queue, or Completed

### Automation

```bash
AUTO_URL="https://www.youtube.com/watch?v=..." \
AUTO_SAVE_PATH="/path/to/output.mp4" \
AUTO_FORMAT="mp4" \
AUTO_QUALITY="1080" \
AUTO_START="1" \
pnpm start
```

| Variable         | Description                                  | Default |
| ---------------- | -------------------------------------------- | ------- |
| `AUTO_URL`       | YouTube video URL                            | —       |
| `AUTO_SAVE_PATH` | Output file path                             | —       |
| `AUTO_FORMAT`    | Format (`mp4`, `webm`, `mp3`, `wav`)         | `mp4`   |
| `AUTO_QUALITY`   | Quality (`best`, `1080`, `720`, `480`, etc.) | `best`  |
| `AUTO_START`     | Auto-start download (`1` = yes)              | `0`     |
| `AUTOMATION_LOG` | Log events to stdout (`1` = yes)             | `0`     |

## Architecture

```
youtube-video-downloader/
├── main.ts                          # Electron main process
├── preload.ts                       # Context bridge (secure IPC)
├── lib/
│   └── utils.ts                     # Pure utility functions (testable)
├── src/
│   ├── types.ts                     # Shared TypeScript interfaces
│   ├── index.html                   # Application UI structure
│   ├── styles.css                   # Dark theme with purple accent
│   └── renderer.ts                  # Renderer process (UI logic)
├── tests/
│   └── utils.test.ts                # Unit tests (via tsx runner)
├── scripts/
│   └── copy-static.js               # Copies HTML/CSS to dist/
├── dist/                            # Compiled output (gitignored)
├── tsconfig.json                    # TypeScript compiler configuration
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                   # Lint, format, typecheck, test (Node 20+22)
│   │   ├── code-quality.yml         # Audit, license check, coverage
│   │   ├── dependency-review.yml    # PR dependency scanning
│   │   ├── pr-checks.yml           # Conventional commit validation
│   │   ├── release.yml              # Tag-based GitHub releases
│   │   └── stale.yml                # Auto-close stale issues/PRs
│   ├── ISSUE_TEMPLATE/              # Bug report & feature request forms
│   ├── PULL_REQUEST_TEMPLATE.md     # PR checklist template
│   ├── CODEOWNERS                   # Code ownership rules
│   ├── SECURITY.md                  # Security policy
│   └── dependabot.yml               # Automated dependency updates
├── CONTRIBUTING.md                  # Contribution guidelines
├── LICENSE                          # MIT License
├── eslint.config.mjs                # ESLint + typescript-eslint flat config
├── .prettierrc                      # Prettier configuration
├── .editorconfig                    # Editor settings
├── .nvmrc                           # Node.js version
└── .npmrc                           # npm/pnpm configuration
```

### Application Architecture

```mermaid
graph TB
    subgraph Electron["Electron Application"]
        subgraph Main["Main Process (main.ts)"]
            WM[Window Manager]
            IPC[IPC Handlers]
            DM[Download Manager]
            HM[History Manager]
            TD[Tool Detector]
        end

        subgraph Preload["Preload (preload.ts)"]
            CB[Context Bridge]
        end

        subgraph Renderer["Renderer Process"]
            UI["UI Layer (index.html + styles.css)"]
            SM["State Manager (renderer.ts)"]
            EH[Event Handlers]
        end

        subgraph Lib["Shared Library (lib/utils.ts)"]
            FN[Pure Utility Functions]
        end
    end

    subgraph External["External Tools"]
        YTDLP[yt-dlp]
        FFMPEG[ffmpeg]
    end

    subgraph Storage["Data Storage"]
        JSON[(download-history.json)]
    end

    subgraph Web["Internet"]
        YT[YouTube Servers]
    end

    SM <-->|"IPC invoke/send"| CB
    CB <-->|"Secure Bridge"| IPC
    IPC --> DM
    IPC --> HM
    IPC --> TD
    DM -->|"uses"| FN
    DM -->|"spawn"| YTDLP
    YTDLP -->|"merge/convert"| FFMPEG
    YTDLP <-->|"fetch"| YT
    HM <-->|"read/write"| JSON
    DM -->|"progress events"| IPC

    style Main fill:#1c1c28,stroke:#7c65f6,color:#f0f0f4
    style Renderer fill:#1c1c28,stroke:#34d399,color:#f0f0f4
    style Preload fill:#1c1c28,stroke:#fbbf24,color:#f0f0f4
    style Lib fill:#1c1c28,stroke:#60a5fa,color:#f0f0f4
    style External fill:#131318,stroke:#5c5c70,color:#f0f0f4
    style Storage fill:#131318,stroke:#5c5c70,color:#f0f0f4
    style Web fill:#131318,stroke:#5c5c70,color:#f0f0f4
```

### Download Flow

```mermaid
sequenceDiagram
    actor User
    participant R as Renderer
    participant M as Main Process
    participant Y as yt-dlp
    participant F as ffmpeg
    participant YT as YouTube

    User->>R: Paste URL & click Analyze
    R->>M: inspectUrl(url)
    M->>Y: --dump-single-json
    Y->>YT: Fetch metadata
    YT-->>Y: Video info + formats
    Y-->>M: JSON metadata
    M-->>R: Parsed metadata
    R-->>User: Show video card with options

    User->>R: Select format, quality, path
    User->>R: Click "Download Now"
    R->>M: startDownload(options)
    M->>Y: Spawn with format args
    Y->>YT: Download streams

    loop Progress Updates
        Y-->>M: Progress line (%, speed, ETA)
        M-->>R: download-progress event
        R-->>User: Update progress bar & sidebar
    end

    Y->>F: Merge video + audio
    F-->>Y: Merged file
    Y-->>M: Exit code 0
    M->>M: Record history
    M-->>R: download-finished event
    R-->>User: Show completion
```

### UI Layout

```mermaid
graph LR
    subgraph App["Application Window"]
        subgraph Sidebar["Sidebar (260px)"]
            Brand["Brand + Version"]
            Tabs["Nav Tabs: All | Active | Queue | Completed"]
            List["Download List with Thumbnails"]
            Footer["Tool Status: yt-dlp + ffmpeg"]
        end

        subgraph Workspace["Main Workspace"]
            ActionBar["Action Bar: URL Input + Paste + Analyze"]
            VideoCard["Video Card: Thumbnail + Format Chips + Config"]
            ActiveDL["Active Downloads with Progress"]
            Queue["Queue with Start All"]
        end

        subgraph StatusBar["Status Bar"]
            ActiveCount["Active: 0"]
            QueueCount["Queue: 0"]
            HistCount["History: 0"]
            Ver["v1.0.0"]
        end
    end

    Brand --> Tabs --> List --> Footer
    ActionBar --> VideoCard --> ActiveDL --> Queue

    style Sidebar fill:#131318,stroke:#5c5c70,color:#f0f0f4
    style Workspace fill:#0c0c10,stroke:#5c5c70,color:#f0f0f4
    style StatusBar fill:#131318,stroke:#5c5c70,color:#f0f0f4
```

### IPC Communication

```mermaid
graph LR
    subgraph Renderer
        A[UI Events]
    end

    subgraph Main
        B[IPC Handlers]
    end

    A -->|"app:get-bootstrap"| B
    A -->|"downloads:inspect-url"| B
    A -->|"downloads:browse-save-path"| B
    A -->|"downloads:start"| B
    A -->|"downloads:cancel"| B
    A -->|"history:open-folder"| B
    A -->|"history:clear"| B
    B -->|"downloads:event (progress)"| A
    B -->|"downloads:event (finished)"| A
    B -->|"downloads:event (history)"| A

    style Renderer fill:#1c1c28,stroke:#34d399,color:#f0f0f4
    style Main fill:#1c1c28,stroke:#7c65f6,color:#f0f0f4
```

### Process Architecture

| Process      | File           | Responsibilities                                                      |
| ------------ | -------------- | --------------------------------------------------------------------- |
| **Main**     | `main.ts`      | Window management, yt-dlp spawning, file dialogs, history persistence |
| **Preload**  | `preload.ts`   | Secure IPC bridge via `contextBridge`                                 |
| **Renderer** | `renderer.ts`  | UI rendering, state management, user interaction handling             |
| **Library**  | `lib/utils.ts` | Pure utility functions shared across processes                        |

### Data Storage

- **Download History**: Stored as JSON in Electron's `userData` directory
  - macOS: `~/Library/Application Support/youtube-downloader-electron/download-history.json`
  - Windows: `%APPDATA%/youtube-downloader-electron/download-history.json`
  - Linux: `~/.config/youtube-downloader-electron/download-history.json`
- Maximum **200** history entries (oldest entries are automatically pruned)

## Scripts

| Script               | Description                                |
| -------------------- | ------------------------------------------ |
| `pnpm build`         | Compile TypeScript + copy static assets    |
| `pnpm start`         | Build + launch the application             |
| `pnpm dev`           | Build + launch in development mode         |
| `pnpm test`          | Run unit tests (via tsx)                   |
| `pnpm test:coverage` | Run tests with coverage report             |
| `pnpm lint`          | Run ESLint                                 |
| `pnpm lint:fix`      | Run ESLint with auto-fix                   |
| `pnpm format`        | Check Prettier formatting                  |
| `pnpm format:fix`    | Fix Prettier formatting                    |
| `pnpm check`         | Type-check all TypeScript (tsc --noEmit)   |
| `pnpm validate`      | Run all checks (typecheck + lint + format) |

## Tech Stack

| Technology                                                        | Purpose                            |
| ----------------------------------------------------------------- | ---------------------------------- |
| [TypeScript](https://www.typescriptlang.org/)                     | Type-safe JavaScript superset      |
| [Electron](https://www.electronjs.org/)                           | Cross-platform desktop framework   |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)                        | YouTube video/audio extraction     |
| [ffmpeg](https://ffmpeg.org/)                                     | Audio/video processing and merging |
| [ESLint 10](https://eslint.org/)                                  | TypeScript linting (flat config)   |
| [Prettier](https://prettier.io/)                                  | Code formatting                    |
| [tsx](https://tsx.is/)                                            | TypeScript test runner (esbuild)   |
| [Node.js Test Runner](https://nodejs.org/api/test.html)           | Unit testing (zero dependencies)   |
| [GitHub Actions](https://github.com/features/actions)             | CI/CD pipelines                    |
| [Dependabot](https://docs.github.com/en/code-security/dependabot) | Automated dependency updates       |

## CI/CD Pipelines

| Workflow              | Trigger             | Jobs                                                               |
| --------------------- | ------------------- | ------------------------------------------------------------------ |
| **CI**                | Push to `main`, PRs | Lint, Format, TypeCheck, Tests (Node 20+22 matrix), Security Audit |
| **Code Quality**      | PRs, Weekly         | Security audit, License compliance, Test coverage                  |
| **Dependency Review** | PRs                 | Vulnerability scanning, License validation                         |
| **PR Checks**         | PRs                 | Conventional commit title validation                               |
| **Release**           | Tag `v*`            | Validate → Create GitHub Release with auto-generated notes         |
| **Stale**             | Daily cron          | Auto-close stale issues and PRs (30 days inactive)                 |

## Supported Formats

| Format | Type  | Codec        | Description                  |
| ------ | ----- | ------------ | ---------------------------- |
| MP4    | Video | H.264 + AAC  | Most compatible video format |
| WEBM   | Video | VP9 + Opus   | Open-source video format     |
| MP3    | Audio | MPEG Layer 3 | Universal audio format       |
| WAV    | Audio | PCM          | Uncompressed lossless audio  |

## Security

- **Context Isolation**: Enabled — renderer cannot access Node.js APIs directly
- **Node Integration**: Disabled — all IPC goes through the preload bridge
- **XSS Protection**: All user-facing content is HTML-escaped via `escapeHtml()`
- **No Remote Content**: App loads only local files
- **Input Validation**: URLs and file paths are validated before processing
- **Dependency Auditing**: Automated via CI and Dependabot

See [SECURITY.md](.github/SECURITY.md) for our vulnerability disclosure policy.

## Troubleshooting

| Issue                           | Solution                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| yt-dlp not found                | Ensure yt-dlp is in PATH: `which yt-dlp` (macOS/Linux) or `where yt-dlp` (Windows) |
| ffmpeg not found                | Install ffmpeg and ensure it's in PATH                                             |
| Download fails with merge error | Update yt-dlp: `yt-dlp -U` or `brew upgrade yt-dlp`                                |
| Video quality not available     | Some videos have limited formats — select "Best available"                         |
| App won't start                 | Check Node.js version: `node --version` (needs 20+)                                |

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Development setup
- Branch naming conventions
- Conventional commit messages
- Pull request process
- Code style and testing

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Author

**Rishat** — [GitHub](https://github.com/rishat5081)

---

Built with Electron + yt-dlp
