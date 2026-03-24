import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  timeAgo,
  getYouTubeVideoId,
  clamp,
  normalizeHexColor,
  hexToRgb,
  rgbToHex,
  mixHex,
  rgbaFromHex,
  getContrastColor,
  buildSidebarItems,
  filterByTab,
  getQualityOptionsForFormat,
  DEFAULT_ACCENT
} from "../lib/renderer-helpers";
import type { HistoryEntry, MetadataPayload, ProgressSnapshot } from "../src/types";
import type { PendingEntry, SidebarItem } from "../lib/renderer-helpers";

/* ---- timeAgo ---- */

describe("timeAgo", () => {
  it("returns 'now' for recent dates", () => {
    assert.equal(timeAgo(new Date().toISOString()), "now");
  });

  it("returns minutes for dates within the hour", () => {
    const date = new Date(Date.now() - 15 * 60000).toISOString();
    assert.equal(timeAgo(date), "15m");
  });

  it("returns hours for dates within the day", () => {
    const date = new Date(Date.now() - 3 * 3600000).toISOString();
    assert.equal(timeAgo(date), "3h");
  });

  it("returns days for older dates", () => {
    const date = new Date(Date.now() - 2 * 86400000).toISOString();
    assert.equal(timeAgo(date), "2d");
  });

  it("handles boundary between minutes and hours", () => {
    const date = new Date(Date.now() - 59 * 60000).toISOString();
    assert.equal(timeAgo(date), "59m");
    const date2 = new Date(Date.now() - 60 * 60000).toISOString();
    assert.equal(timeAgo(date2), "1h");
  });
});

/* ---- getYouTubeVideoId ---- */

describe("getYouTubeVideoId", () => {
  it("extracts ID from youtube.com watch URL", () => {
    assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from youtu.be short URL", () => {
    assert.equal(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(getYouTubeVideoId(null), "");
    assert.equal(getYouTubeVideoId(undefined), "");
  });

  it("returns empty string for invalid URL", () => {
    assert.equal(getYouTubeVideoId("not-a-url"), "");
  });

  it("returns empty string for non-YouTube URLs", () => {
    assert.equal(getYouTubeVideoId("https://vimeo.com/12345"), "");
  });

  it("handles URL with extra params", () => {
    assert.equal(
      getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"),
      "dQw4w9WgXcQ"
    );
  });
});

/* ---- clamp ---- */

describe("clamp", () => {
  it("returns value within range", () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  it("clamps below min", () => {
    assert.equal(clamp(-5, 0, 10), 0);
  });

  it("clamps above max", () => {
    assert.equal(clamp(15, 0, 10), 10);
  });
});

/* ---- normalizeHexColor ---- */

describe("normalizeHexColor", () => {
  it("normalizes 6-digit hex", () => {
    assert.equal(normalizeHexColor("#ff0000"), "#ff0000");
  });

  it("expands 3-digit shorthand", () => {
    assert.equal(normalizeHexColor("#f00"), "#ff0000");
  });

  it("adds # prefix when missing", () => {
    assert.equal(normalizeHexColor("ff0000"), "#ff0000");
  });

  it("returns default for null/undefined", () => {
    assert.equal(normalizeHexColor(null), DEFAULT_ACCENT);
    assert.equal(normalizeHexColor(undefined), DEFAULT_ACCENT);
  });

  it("returns default for invalid hex", () => {
    assert.equal(normalizeHexColor("xyz"), DEFAULT_ACCENT);
    assert.equal(normalizeHexColor("#gggggg"), DEFAULT_ACCENT);
  });

  it("lowercases hex digits", () => {
    assert.equal(normalizeHexColor("#FF0000"), "#ff0000");
  });
});

/* ---- hexToRgb / rgbToHex ---- */

describe("hexToRgb", () => {
  it("converts known hex to RGB", () => {
    assert.deepEqual(hexToRgb("#ff0000"), { r: 255, g: 0, b: 0 });
    assert.deepEqual(hexToRgb("#00ff00"), { r: 0, g: 255, b: 0 });
    assert.deepEqual(hexToRgb("#0000ff"), { r: 0, g: 0, b: 255 });
  });

  it("handles black and white", () => {
    assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
    assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  });
});

describe("rgbToHex", () => {
  it("converts known RGB to hex", () => {
    assert.equal(rgbToHex(255, 0, 0), "#ff0000");
    assert.equal(rgbToHex(0, 255, 0), "#00ff00");
  });

  it("clamps values outside 0-255", () => {
    assert.equal(rgbToHex(300, -10, 128), "#ff0080");
  });

  it("roundtrips with hexToRgb", () => {
    const hex = "#3b82f6";
    const { r, g, b } = hexToRgb(hex);
    assert.equal(rgbToHex(r, g, b), hex);
  });
});

/* ---- mixHex ---- */

describe("mixHex", () => {
  it("amount=0 returns base color", () => {
    assert.equal(mixHex("#ff0000", "#0000ff", 0), "#ff0000");
  });

  it("amount=1 returns target color", () => {
    assert.equal(mixHex("#ff0000", "#0000ff", 1), "#0000ff");
  });

  it("amount=0.5 returns midpoint", () => {
    const result = mixHex("#000000", "#ffffff", 0.5);
    const { r, g, b } = hexToRgb(result);
    assert.ok(r >= 126 && r <= 129);
    assert.ok(g >= 126 && g <= 129);
    assert.ok(b >= 126 && b <= 129);
  });
});

/* ---- rgbaFromHex ---- */

describe("rgbaFromHex", () => {
  it("converts hex with alpha=0.5", () => {
    assert.equal(rgbaFromHex("#ff0000", 0.5), "rgba(255, 0, 0, 0.5)");
  });

  it("converts hex with alpha=1", () => {
    assert.equal(rgbaFromHex("#00ff00", 1), "rgba(0, 255, 0, 1)");
  });
});

/* ---- getContrastColor ---- */

describe("getContrastColor", () => {
  it("returns white for dark input", () => {
    assert.equal(getContrastColor("#000000"), "#ffffff");
    assert.equal(getContrastColor("#1a1a1a"), "#ffffff");
  });

  it("returns dark for light input", () => {
    assert.equal(getContrastColor("#ffffff"), "#111827");
    assert.equal(getContrastColor("#ffff00"), "#111827");
  });

  it("handles mid-range colors", () => {
    const result = getContrastColor("#808080");
    assert.ok(result === "#ffffff" || result === "#111827");
  });
});

/* ---- buildSidebarItems ---- */

describe("buildSidebarItems", () => {
  it("returns empty array when all inputs empty", () => {
    const result = buildSidebarItems(new Map(), [], []);
    assert.deepEqual(result, []);
  });

  it("includes active downloads", () => {
    const downloads = new Map<string, ProgressSnapshot>();
    downloads.set("task-1", {
      id: "task-1",
      title: "Active Video",
      url: "https://youtube.com/1",
      format: "mp4",
      quality: "1080",
      savePath: "/tmp/1.mp4",
      outputPath: "/tmp/1.mp4",
      status: "downloading",
      percent: 50,
      speed: 1000,
      eta: 30,
      downloadedBytes: 500,
      totalBytes: 1000
    });
    const result = buildSidebarItems(downloads, [], []);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "active");
    assert.equal(result[0].title, "Active Video");
  });

  it("includes queued entries", () => {
    const pending: PendingEntry[] = [
      {
        id: "q-1",
        url: "https://youtube.com/2",
        title: "Queued Video",
        thumbnail: "",
        format: "mp3",
        quality: "best",
        savePath: "/tmp/2.mp3"
      }
    ];
    const result = buildSidebarItems(new Map(), pending, []);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "queued");
    assert.equal(result[0].status, "queued");
  });

  it("includes history entries", () => {
    const history: HistoryEntry[] = [
      {
        id: "h-1",
        title: "Completed Video",
        url: "https://youtube.com/3",
        format: "mp4",
        quality: "720",
        savePath: "/tmp/3.mp4",
        outputPath: "/tmp/final-3.mp4",
        status: "completed",
        errorMessage: "",
        fileSize: 1024,
        completedAt: new Date().toISOString()
      }
    ];
    const result = buildSidebarItems(new Map(), [], history);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "history");
    assert.equal(result[0].path, "/tmp/final-3.mp4");
  });

  it("combines all sources in order", () => {
    const downloads = new Map<string, ProgressSnapshot>();
    downloads.set("a", {
      id: "a",
      title: "A",
      url: "",
      format: "mp4",
      quality: "best",
      savePath: "",
      outputPath: "",
      status: "downloading",
      percent: 0,
      speed: 0,
      eta: 0,
      downloadedBytes: 0,
      totalBytes: 0
    });
    const pending: PendingEntry[] = [
      { id: "b", url: "", title: "B", thumbnail: "", format: "mp4", quality: "best", savePath: "" }
    ];
    const history: HistoryEntry[] = [
      {
        id: "c",
        title: "C",
        url: "",
        format: "mp4",
        quality: "best",
        savePath: "",
        outputPath: "",
        status: "completed",
        errorMessage: "",
        fileSize: 0,
        completedAt: new Date().toISOString()
      }
    ];
    const result = buildSidebarItems(downloads, pending, history);
    assert.equal(result.length, 3);
    assert.equal(result[0].type, "active");
    assert.equal(result[1].type, "queued");
    assert.equal(result[2].type, "history");
  });
});

/* ---- filterByTab ---- */

describe("filterByTab", () => {
  const items: SidebarItem[] = [
    {
      id: "1",
      title: "A",
      format: "mp4",
      quality: "best",
      status: "downloading",
      thumbnail: "",
      time: "",
      type: "active",
      path: ""
    },
    {
      id: "2",
      title: "B",
      format: "mp4",
      quality: "best",
      status: "queued",
      thumbnail: "",
      time: "",
      type: "queued",
      path: ""
    },
    {
      id: "3",
      title: "C",
      format: "mp4",
      quality: "best",
      status: "completed",
      thumbnail: "",
      time: "1h",
      type: "history",
      path: "/out"
    },
    {
      id: "4",
      title: "D",
      format: "mp4",
      quality: "best",
      status: "failed",
      thumbnail: "",
      time: "2h",
      type: "history",
      path: ""
    }
  ];

  it("returns all items for 'all' tab", () => {
    assert.equal(filterByTab(items, "all").length, 4);
  });

  it("returns only active items for 'active' tab", () => {
    const result = filterByTab(items, "active");
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "active");
  });

  it("returns only queued items for 'queued' tab", () => {
    const result = filterByTab(items, "queued");
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "queued");
  });

  it("returns only completed items for 'completed' tab", () => {
    const result = filterByTab(items, "completed");
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "completed");
  });

  it("returns all items for unknown tab", () => {
    assert.equal(filterByTab(items, "unknown").length, 4);
  });
});

/* ---- getQualityOptionsForFormat ---- */

describe("getQualityOptionsForFormat", () => {
  const metadata: MetadataPayload = {
    title: "Test",
    uploader: "Tester",
    duration: 120,
    thumbnail: "",
    webpageUrl: "",
    suggestedFilename: "test",
    availableVideoQualities: {
      mp4: [
        { value: "best", label: "Best available" },
        { value: "1080", label: "1080p" },
        { value: "720", label: "720p" }
      ],
      webm: [
        { value: "best", label: "Best available" },
        { value: "720", label: "720p" }
      ]
    },
    availableAudioQualities: [
      { value: "best", label: "Best audio" },
      { value: "320", label: "320 kbps" }
    ]
  };

  it("returns audio qualities for mp3", () => {
    const result = getQualityOptionsForFormat(metadata, "mp3");
    assert.equal(result[0].value, "best");
    assert.equal(result[1].value, "320");
  });

  it("returns audio qualities for wav", () => {
    const result = getQualityOptionsForFormat(metadata, "wav");
    assert.equal(result.length, 2);
  });

  it("returns video qualities for mp4", () => {
    const result = getQualityOptionsForFormat(metadata, "mp4");
    assert.equal(result.length, 3);
    assert.equal(result[1].value, "1080");
  });

  it("returns default when no metadata", () => {
    const result = getQualityOptionsForFormat(null, "mp4");
    assert.equal(result.length, 1);
    assert.equal(result[0].value, "best");
  });
});
