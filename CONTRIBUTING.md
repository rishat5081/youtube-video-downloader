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

# Enable corepack for pnpm
corepack enable

# Install dependencies
pnpm install

# Start the app
pnpm start
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

| Script               | Description                             |
| -------------------- | --------------------------------------- |
| `pnpm start`         | Launch the Electron app                 |
| `pnpm dev`           | Launch in development mode              |
| `pnpm test`          | Run all tests                           |
| `pnpm test:coverage` | Run tests with coverage report          |
| `pnpm lint`          | Run ESLint                              |
| `pnpm lint:fix`      | Run ESLint with auto-fix                |
| `pnpm format`        | Check Prettier formatting               |
| `pnpm format:fix`    | Fix Prettier formatting                 |
| `pnpm check`         | Syntax-check all JavaScript files       |
| `pnpm validate`      | Run all checks (syntax + lint + format) |

## Project Structure

```
youtube-video-downloader/
├── main.js              # Electron main process
├── preload.js           # Context bridge (secure IPC)
├── lib/
│   └── utils.js         # Shared pure utility functions
├── src/
│   ├── index.html       # Application UI
│   ├── styles.css       # Styling (dark theme)
│   └── renderer.js      # Renderer process logic
├── tests/
│   └── utils.test.js    # Unit tests for utility functions
└── .github/
    └── workflows/       # CI/CD pipelines
```

## Code Style

- **ESLint** for JavaScript linting (flat config, ES2024)
- **Prettier** for code formatting
- No `var` — use `const` or `let`
- Strict equality (`===`) always
- All HTML output must use `escapeHtml()` to prevent XSS

## Testing

We use Node.js built-in test runner (`node:test`). Tests are in `tests/`:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage
```

When adding new utility functions to `lib/utils.js`, add corresponding tests in `tests/utils.test.js`.

## Security

- Never disable context isolation or enable node integration
- Always escape user content before inserting into HTML
- Validate all IPC payloads in the main process
- See [SECURITY.md](.github/SECURITY.md) for our security policy

## Questions?

Open a [Discussion](https://github.com/rishat5081/youtube-video-downloader/discussions) or check existing issues.
