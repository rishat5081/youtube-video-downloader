import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFilename,
  ensureExtension,
  formatFilterFor,
  toUniqueSortedNumbers,
  extractVideoQualities,
  extractAudioQualities,
  buildFormatArguments,
  parseProgressLine,
  buildMetadataPayload,
  getDurationLabel,
  getFileSizeLabel,
  getSpeedLabel,
  getEtaLabel,
  escapeHtml
} from "../lib/utils";

/* ---- sanitizeFilename ---- */

describe("sanitizeFilename", () => {
  it("removes forbidden characters", () => {
    assert.equal(sanitizeFilename('test<>:"/\\|?*file'), "test file");
  });

  it("collapses multiple spaces", () => {
    assert.equal(sanitizeFilename("hello   world"), "hello world");
  });

  it("returns 'download' for empty input", () => {
    assert.equal(sanitizeFilename(""), "download");
    assert.equal(sanitizeFilename(null), "download");
    assert.equal(sanitizeFilename(undefined), "download");
  });

  it("truncates at 180 characters", () => {
    const long = "a".repeat(300);
    assert.equal(sanitizeFilename(long).length, 180);
  });

  it("trims whitespace", () => {
    assert.equal(sanitizeFilename("  hello  "), "hello");
  });
});

/* ---- ensureExtension ---- */

describe("ensureExtension", () => {
  it("adds extension when missing", () => {
    assert.equal(ensureExtension("/path/to/file", "mp4"), "/path/to/file.mp4");
  });

  it("keeps existing correct extension", () => {
    assert.equal(ensureExtension("/path/to/file.mp4", "mp4"), "/path/to/file.mp4");
  });

  it("is case-insensitive", () => {
    assert.equal(ensureExtension("/path/to/file.MP4", "mp4"), "/path/to/file.MP4");
  });

  it("replaces trailing dots", () => {
    assert.equal(ensureExtension("/path/to/file...", "mp4"), "/path/to/file.mp4");
  });

  it("adds extension when different extension exists", () => {
    assert.equal(ensureExtension("/path/to/file.webm", "mp4"), "/path/to/file.webm.mp4");
  });
});

/* ---- formatFilterFor ---- */

describe("formatFilterFor", () => {
  it("returns correct filter object", () => {
    const result = formatFilterFor("mp4");
    assert.deepEqual(result, { name: "MP4 file", extensions: ["mp4"] });
  });

  it("uppercases the extension in name", () => {
    assert.equal(formatFilterFor("webm").name, "WEBM file");
  });
});

/* ---- toUniqueSortedNumbers ---- */

describe("toUniqueSortedNumbers", () => {
  it("removes duplicates and sorts descending", () => {
    assert.deepEqual(toUniqueSortedNumbers([720, 1080, 720, 480]), [1080, 720, 480]);
  });

  it("removes non-finite values", () => {
    assert.deepEqual(toUniqueSortedNumbers([1080, NaN, Infinity, 720]), [1080, 720]);
  });

  it("removes zero and negative values", () => {
    assert.deepEqual(toUniqueSortedNumbers([0, -1, 480, 720]), [720, 480]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(toUniqueSortedNumbers([]), []);
  });
});

/* ---- extractVideoQualities ---- */

describe("extractVideoQualities", () => {
  const formats = [
    { vcodec: "avc1", height: 1080, ext: "mp4" },
    { vcodec: "avc1", height: 720, ext: "mp4" },
    { vcodec: "vp9", height: 1080, ext: "webm" },
    { vcodec: "none", height: 480, ext: "mp4" }
  ];

  it("filters by extension and returns sorted qualities", () => {
    const result = extractVideoQualities(formats, "mp4");
    assert.equal(result[0].value, "best");
    assert.equal(result[1].value, "1080");
    assert.equal(result[2].value, "720");
    assert.equal(result.length, 3);
  });

  it("excludes formats with vcodec 'none'", () => {
    const result = extractVideoQualities(formats, "mp4");
    assert.ok(!result.some((q) => q.value === "480"));
  });

  it("always includes 'Best available' as first option", () => {
    const result = extractVideoQualities(formats, "webm");
    assert.equal(result[0].label, "Best available");
  });
});

/* ---- extractAudioQualities ---- */

describe("extractAudioQualities", () => {
  it("extracts bitrates from formats", () => {
    const formats = [{ abr: 128 }, { abr: 256 }, { abr: 320 }, { abr: 48 }];
    const result = extractAudioQualities(formats);
    assert.equal(result[0].value, "best");
    assert.equal(result[1].value, "320");
    assert.equal(result[2].value, "256");
    assert.equal(result[3].value, "128");
  });

  it("provides defaults when no valid bitrates found", () => {
    const result = extractAudioQualities([]);
    assert.equal(result[0].value, "best");
    assert.ok(result.length > 1);
  });

  it("filters out bitrates below 64", () => {
    const formats = [{ abr: 32 }, { abr: 48 }, { abr: 128 }];
    const result = extractAudioQualities(formats);
    assert.ok(!result.some((q) => q.value === "32" || q.value === "48"));
  });
});

/* ---- buildFormatArguments ---- */

describe("buildFormatArguments", () => {
  it("builds mp4 best quality args", () => {
    const args = buildFormatArguments({ format: "mp4", quality: "best" });
    assert.ok(args.includes("--format"));
    assert.ok(args.includes("--merge-output-format"));
    assert.ok(args.some((a) => a.includes("mp4")));
  });

  it("builds mp4 specific quality args", () => {
    const args = buildFormatArguments({ format: "mp4", quality: "720" });
    assert.ok(args.some((a) => a.includes("720")));
  });

  it("builds webm args", () => {
    const args = buildFormatArguments({ format: "webm", quality: "best" });
    assert.ok(args.some((a) => a.includes("webm")));
  });

  it("builds mp3 audio args", () => {
    const args = buildFormatArguments({ format: "mp3", quality: "best" });
    assert.ok(args.includes("--extract-audio"));
    assert.ok(args.includes("--audio-format"));
    assert.ok(args.includes("mp3"));
    assert.ok(args.includes("--audio-quality"));
    assert.ok(args.includes("0"));
  });

  it("builds wav audio args with specific quality", () => {
    const args = buildFormatArguments({ format: "wav", quality: "192" });
    assert.ok(args.includes("wav"));
    assert.ok(args.includes("192"));
  });
});

/* ---- parseProgressLine ---- */

describe("parseProgressLine", () => {
  it("parses a valid progress line", () => {
    const line = "download:downloading|5242880|10485760|10485760| 50.0%|1048576|5";
    const result = parseProgressLine(line);
    assert.equal(result!.status, "downloading");
    assert.equal(result!.percent, 50);
    assert.equal(result!.downloadedBytes, 5242880);
    assert.equal(result!.totalBytes, 10485760);
    assert.equal(result!.speed, 1048576);
    assert.equal(result!.eta, 5);
  });

  it("returns null for non-progress lines", () => {
    assert.equal(parseProgressLine("some random text"), null);
    assert.equal(parseProgressLine("ERROR: something"), null);
  });

  it("returns null for malformed progress lines", () => {
    assert.equal(parseProgressLine("download:short"), null);
  });

  it("handles finished status", () => {
    const line = "download:finished|10485760|10485760|10485760|100.0%|0|0";
    const result = parseProgressLine(line);
    assert.equal(result!.status, "finished");
    assert.equal(result!.percent, 100);
  });
});

/* ---- buildMetadataPayload ---- */

describe("buildMetadataPayload", () => {
  it("builds complete metadata from video info", () => {
    const info = {
      title: "Test Video",
      uploader: "Test Channel",
      duration: 120,
      thumbnail: "https://img.youtube.com/thumb.jpg",
      webpage_url: "https://youtube.com/watch?v=test",
      formats: [
        { vcodec: "avc1", height: 1080, ext: "mp4" },
        { vcodec: "avc1", height: 720, ext: "mp4" }
      ]
    };
    const result = buildMetadataPayload("https://youtube.com/watch?v=test", info);
    assert.equal(result.title, "Test Video");
    assert.equal(result.uploader, "Test Channel");
    assert.equal(result.duration, 120);
    assert.ok(result.availableVideoQualities.mp4.length > 0);
    assert.ok(result.availableAudioQualities.length > 0);
    assert.equal(result.suggestedFilename, "Test Video");
  });

  it("provides defaults for missing fields", () => {
    const result = buildMetadataPayload("https://url.com", {});
    assert.equal(result.title, "Untitled video");
    assert.equal(result.uploader, "Unknown creator");
    assert.equal(result.duration, 0);
  });
});

/* ---- getDurationLabel ---- */

describe("getDurationLabel", () => {
  it("formats seconds only", () => {
    assert.equal(getDurationLabel(45), "00:45");
  });

  it("formats minutes and seconds", () => {
    assert.equal(getDurationLabel(125), "02:05");
  });

  it("formats hours, minutes, seconds", () => {
    assert.equal(getDurationLabel(3661), "01:01:01");
  });

  it("returns 0:00 for falsy input", () => {
    assert.equal(getDurationLabel(0), "0:00");
    assert.equal(getDurationLabel(null), "0:00");
    assert.equal(getDurationLabel(undefined), "0:00");
  });
});

/* ---- getFileSizeLabel ---- */

describe("getFileSizeLabel", () => {
  it("formats bytes", () => {
    assert.equal(getFileSizeLabel(500), "500 B");
  });

  it("formats kilobytes", () => {
    assert.equal(getFileSizeLabel(1536), "1.5 KB");
  });

  it("formats megabytes", () => {
    assert.equal(getFileSizeLabel(10485760), "10.0 MB");
  });

  it("formats gigabytes", () => {
    assert.equal(getFileSizeLabel(1073741824), "1.0 GB");
  });

  it("returns 0 B for falsy input", () => {
    assert.equal(getFileSizeLabel(0), "0 B");
    assert.equal(getFileSizeLabel(null), "0 B");
  });
});

/* ---- getSpeedLabel ---- */

describe("getSpeedLabel", () => {
  it("formats speed with units", () => {
    assert.equal(getSpeedLabel(1048576), "1.0 MB/s");
  });

  it("returns --- for zero", () => {
    assert.equal(getSpeedLabel(0), "---");
  });
});

/* ---- getEtaLabel ---- */

describe("getEtaLabel", () => {
  it("formats seconds only", () => {
    assert.equal(getEtaLabel(30), "30s");
  });

  it("formats minutes and seconds", () => {
    assert.equal(getEtaLabel(90), "1m 30s");
  });

  it("returns finishing for zero", () => {
    assert.equal(getEtaLabel(0), "finishing");
  });

  it("returns --- for null", () => {
    assert.equal(getEtaLabel(null), "---");
  });
});

/* ---- escapeHtml ---- */

describe("escapeHtml", () => {
  it("escapes all HTML special characters", () => {
    assert.equal(escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("escapes ampersands", () => {
    assert.equal(escapeHtml("a & b"), "a &amp; b");
  });

  it("escapes single quotes", () => {
    assert.equal(escapeHtml("it's"), "it&#39;s");
  });

  it("handles non-string input", () => {
    assert.equal(escapeHtml(123), "123");
    assert.equal(escapeHtml(null), "null");
  });
});
