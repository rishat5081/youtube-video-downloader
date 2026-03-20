# Contributing to YouTube Video Downloader

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** 20+
- **pnpm** (installed automatically via corepack)
- **yt-dlp** and **ffmpeg** in your PATH

### Getting Started

```bash
# Clone the repo
git clone https://github.com/rishat5081/youtube-video-downloader.git
cd youtube-video-downloader

# Install the toolchain, dependencies, build, and launch
./application.start
```

## Development Workflow

### Branch Naming

Use descriptive branch names with a prefix:

- `feat/` — New features (e.g., `feat/playlist-support`)
- `fix/` — Bug fixes (e.g., `fix/progress-bar-stuck`)
- `docs/` — Documentation changes
- `refactor/` — Code refactoring
- `ci/` — CI/CD changes
- `test/` — Test additions or fixes

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add playlist download support
fix: resolve progress bar not updating
docs: update installation instructions
test: add tests for parseProgressLine
refactor: extract utility functions to lib/utils.js
ci: add dependency review workflow
```

### Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes
3. Run all checks: `pnpm validate`
4. Run tests: `pnpm test`
5. Push your branch and open a Pull Request
6. Fill out the PR template completely

## Available Scripts

| Script                | Description                                |
| --------------------- | ------------------------------------------ |
| `./application.start` | Install toolchain, deps, build, and launch |
| `pnpm build`          | Compile TypeScript + copy static assets    |
| `pnpm start`          | Build + launch the Electron app            |
| `pnpm dev`            | Build + launch in development mode         |
| `pnpm test`           | Run all tests (via tsx)                    |
| `pnpm test:coverage`  | Run tests with coverage report             |
| `pnpm lint`           | Run ESLint                                 |
| `pnpm lint:fix`       | Run ESLint with auto-fix                   |
| `pnpm format`         | Check Prettier formatting                  |
| `pnpm format:fix`     | Fix Prettier formatting                    |
| `pnpm check`          | Type-check all TypeScript (tsc --noEmit)   |
| `pnpm validate`       | Run all checks (typecheck + lint + format) |

## Project Structure

```
youtube-video-downloader/
├── main.ts              # Electron main process
├── preload.ts           # Context bridge (secure IPC)
├── lib/
│   └── utils.ts         # Shared pure utility functions
├── src/
│   ├── types.ts         # Shared TypeScript interfaces
│   ├── index.html       # Application UI
│   ├── styles.css       # Styling (dark theme)
│   └── renderer.ts      # Renderer process logic
├── tests/
│   └── utils.test.ts    # Unit tests for utility functions
├── scripts/
│   └── copy-static.js   # Copies HTML/CSS to dist/
├── application.start    # Cross-platform bootstrap + launch script
├── dist/                # Compiled output (gitignored)
├── tsconfig.base.json   # Shared TypeScript compiler options
├── tsconfig.main.json   # Main/preload TypeScript build
├── tsconfig.renderer.json # Renderer TypeScript build
├── tsconfig.test.json   # Test type-check config
├── tsconfig.json        # TypeScript project references
└── .github/
    └── workflows/       # CI/CD pipelines
```

## Code Style

- **TypeScript** with `strict: true` — all code is type-checked
- **ESLint** with `typescript-eslint` for linting (flat config, ES2024)
- **Prettier** for code formatting
- No `var` — use `const` or `let`
- Strict equality (`===`) always
- All HTML output must use `escapeHtml()` to prevent XSS
- Add types to all function parameters and return values

## Testing

We use Node.js built-in test runner (`node:test`) with `tsx` to run TypeScript directly. Tests are in `tests/`:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage
```

When adding new utility functions to `lib/utils.ts`, add corresponding tests in `tests/utils.test.ts`.

## Security

- Never disable context isolation or enable node integration
- Always escape user content before inserting into HTML
- Validate all IPC payloads in the main process
- See [SECURITY.md](.github/SECURITY.md) for our security policy

## Questions?

Open a [Discussion](https://github.com/rishat5081/youtube-video-downloader/discussions) or check existing issues.
