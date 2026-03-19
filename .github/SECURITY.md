# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it responsibly.

**Do NOT open a public GitHub issue.**

Instead, please email the maintainer directly or use [GitHub's private vulnerability reporting](https://github.com/rishat5081/youtube-video-downloader/security/advisories/new).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Resolution**: Depends on severity, typically within 30 days

### Scope

This policy applies to the latest release of the YouTube Video Downloader application. Third-party dependencies (yt-dlp, ffmpeg) should be reported to their respective maintainers.

## Security Best Practices

This application follows these security practices:

- **Context Isolation**: Enabled in Electron — renderer process cannot access Node.js APIs
- **Node Integration**: Disabled — all communication goes through the preload bridge
- **XSS Protection**: All user-facing content is HTML-escaped
- **No Remote Content**: Application loads only local files
- **Input Validation**: URLs and file paths are validated before processing
- **No Eval**: No use of `eval()` or `Function()` constructors
