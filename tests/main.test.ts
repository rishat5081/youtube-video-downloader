import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getAutomationConfig, splitLines, buildProgressSnapshot } from "../lib/main-helpers";
import type { DownloadTask, ProgressData } from "../src/types";

/* ---- getAutomationConfig ---- */

describe("getAutomationConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all AUTO_* vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("AUTO")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("AUTO")) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns null when no env vars set", () => {
    assert.equal(getAutomationConfig(), null);
  });

  it("returns config when AUTO_URL + AUTO_SAVE_PATH set", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp4";
    const config = getAutomationConfig();
    assert.ok(config);
    assert.equal(config.url, "https://youtube.com/watch?v=test");
    assert.equal(config.savePath, "/tmp/out.mp4");
  });

  it("defaults format to mp4 and quality to best", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp4";
    const config = getAutomationConfig()!;
    assert.equal(config.format, "mp4");
    assert.equal(config.quality, "best");
  });

  it("parses AUTO_FORMAT and AUTO_QUALITY", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp3";
    process.env.AUTO_FORMAT = "mp3";
    process.env.AUTO_QUALITY = "192";
    const config = getAutomationConfig()!;
    assert.equal(config.format, "mp3");
    assert.equal(config.quality, "192");
  });

  it("AUTO_START=1 sets autoStart true", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp4";
    process.env.AUTO_START = "1";
    const config = getAutomationConfig()!;
    assert.equal(config.autoStart, true);
  });

  it("AUTO_QUIT=1 sets autoQuit true", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp4";
    process.env.AUTO_QUIT = "1";
    const config = getAutomationConfig()!;
    assert.equal(config.autoQuit, true);
  });

  it("AUTO_CANCEL_AFTER_MS parses to number", () => {
    process.env.AUTO_URL = "https://youtube.com/watch?v=test";
    process.env.AUTO_SAVE_PATH = "/tmp/out.mp4";
    process.env.AUTO_CANCEL_AFTER_MS = "5000";
    const config = getAutomationConfig()!;
    assert.equal(config.cancelAfterMs, 5000);
  });

  it("AUTO_CLEAR_HISTORY=1 activates without URL", () => {
    process.env.AUTO_CLEAR_HISTORY = "1";
    const config = getAutomationConfig();
    assert.ok(config);
    assert.equal(config.clearHistory, true);
  });

  it("AUTO_OPEN_HISTORY_FIRST=1 activates without URL", () => {
    process.env.AUTO_OPEN_HISTORY_FIRST = "1";
    const config = getAutomationConfig();
    assert.ok(config);
    assert.equal(config.openFirstHistory, true);
  });

  it("AUTO_QUEUE parses valid JSON array", () => {
    const queue = [
      { url: "https://youtube.com/1", title: "Vid 1", format: "mp4", quality: "best", savePath: "/tmp/1.mp4" }
    ];
    process.env.AUTO_QUEUE = JSON.stringify(queue);
    const config = getAutomationConfig()!;
    assert.ok(config.queueItems);
    assert.equal(config.queueItems.length, 1);
    assert.equal(config.queueItems[0].url, "https://youtube.com/1");
  });

  it("AUTO_QUEUE invalid JSON returns no queueItems", () => {
    process.env.AUTO_QUEUE = "not-json{";
    const config = getAutomationConfig();
    assert.equal(config, null);
  });

  it("AUTO_QUEUE filters invalid items", () => {
    const queue = [
      { url: "https://youtube.com/1", title: "Vid 1", format: "mp4", quality: "best", savePath: "/tmp/1.mp4" },
      { url: "https://youtube.com/2" }, // missing fields
      42 // not an object
    ];
    process.env.AUTO_QUEUE = JSON.stringify(queue);
    const config = getAutomationConfig()!;
    assert.ok(config.queueItems);
    assert.equal(config.queueItems.length, 1);
  });
});

/* ---- splitLines ---- */

describe("splitLines", () => {
  it("splits complete lines, returns remainder", () => {
    const lines: string[] = [];
    const remainder = splitLines("", "hello\nworld\npartial", (l) => lines.push(l));
    assert.deepEqual(lines, ["hello", "world"]);
    assert.equal(remainder, "partial");
  });

  it("handles multiple lines in one chunk", () => {
    const lines: string[] = [];
    splitLines("", "a\nb\nc\n", (l) => lines.push(l));
    assert.deepEqual(lines, ["a", "b", "c"]);
  });

  it("accumulates partial lines across calls", () => {
    const lines: string[] = [];
    const r1 = splitLines("", "hel", (l) => lines.push(l));
    assert.equal(r1, "hel");
    assert.equal(lines.length, 0);
    const r2 = splitLines(r1, "lo\n", (l) => lines.push(l));
    assert.equal(r2, "");
    assert.deepEqual(lines, ["hello"]);
  });

  it("trims whitespace and skips empty lines", () => {
    const lines: string[] = [];
    splitLines("", "  first  \n\n  second  \n", (l) => lines.push(l));
    assert.deepEqual(lines, ["first", "second"]);
  });

  it("handles \\r\\n line endings", () => {
    const lines: string[] = [];
    splitLines("", "line1\r\nline2\r\n", (l) => lines.push(l));
    assert.deepEqual(lines, ["line1", "line2"]);
  });

  it("returns empty string when chunk ends with newline", () => {
    const lines: string[] = [];
    const remainder = splitLines("", "complete\n", (l) => lines.push(l));
    assert.equal(remainder, "");
  });
});

/* ---- buildProgressSnapshot ---- */

describe("buildProgressSnapshot", () => {
  const baseTask = {
    id: "task-1",
    title: "Test Video",
    url: "https://youtube.com/watch?v=test",
    format: "mp4",
    quality: "1080",
    savePath: "/tmp/video.mp4",
    outputPath: "/tmp/final-video.mp4",
    status: "downloading",
    cancelled: false,
    settled: false,
    process: {} as DownloadTask["process"]
  };

  const baseProgress: ProgressData = {
    status: "downloading",
    percent: 50,
    speed: 1048576,
    eta: 30,
    downloadedBytes: 5242880,
    totalBytes: 10485760
  };

  it("maps all fields correctly", () => {
    const snapshot = buildProgressSnapshot(baseTask, baseProgress);
    assert.equal(snapshot.id, "task-1");
    assert.equal(snapshot.title, "Test Video");
    assert.equal(snapshot.url, "https://youtube.com/watch?v=test");
    assert.equal(snapshot.format, "mp4");
    assert.equal(snapshot.quality, "1080");
    assert.equal(snapshot.status, "downloading");
    assert.equal(snapshot.percent, 50);
    assert.equal(snapshot.speed, 1048576);
    assert.equal(snapshot.eta, 30);
    assert.equal(snapshot.downloadedBytes, 5242880);
    assert.equal(snapshot.totalBytes, 10485760);
  });

  it("uses outputPath when available", () => {
    const snapshot = buildProgressSnapshot(baseTask, baseProgress);
    assert.equal(snapshot.outputPath, "/tmp/final-video.mp4");
  });

  it("falls back to savePath when outputPath empty", () => {
    const task = { ...baseTask, outputPath: "" };
    const snapshot = buildProgressSnapshot(task, baseProgress);
    assert.equal(snapshot.outputPath, "/tmp/video.mp4");
  });

  it("preserves numeric values", () => {
    const progress: ProgressData = {
      status: "downloading",
      percent: 99.5,
      speed: 0,
      eta: 0,
      downloadedBytes: 0,
      totalBytes: 0
    };
    const snapshot = buildProgressSnapshot(baseTask, progress);
    assert.equal(snapshot.percent, 99.5);
    assert.equal(snapshot.speed, 0);
    assert.equal(snapshot.eta, 0);
  });
});
