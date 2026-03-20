import path from "path";
import type {
  FormatArgInput,
  FormatFilter,
  MetadataPayload,
  ProgressData,
  QualityOption,
  YtDlpFormat,
  YtDlpInfo
} from "../src/types";

export function sanitizeFilename(value: string | null | undefined): string {
  return (
    (value || "download")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "download"
  );
}

export function ensureExtension(filePath: string, extension: string): string {
  if (path.extname(filePath).toLowerCase() === `.${extension}`) {
    return filePath;
  }
  return `${filePath.replace(/\.+$/, "")}.${extension}`;
}

export function formatFilterFor(extension: string): FormatFilter {
  return {
    name: `${extension.toUpperCase()} file`,
    extensions: [extension]
  };
}

export function toUniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => b - a);
}

export function extractVideoQualities(formats: YtDlpFormat[], preferredExt?: string): QualityOption[] {
  const matching = formats.filter((format) => {
    return (
      format.vcodec &&
      format.vcodec !== "none" &&
      Number.isFinite(format.height) &&
      (!preferredExt || format.ext === preferredExt)
    );
  });

  const heights = toUniqueSortedNumbers(matching.map((format) => format.height!));
  const list = heights.map((height) => ({
    value: String(height),
    label: `${height}p`
  }));

  return [{ value: "best", label: "Best available" }, ...list];
}

export function extractAudioQualities(formats: YtDlpFormat[]): QualityOption[] {
  const bitrates = toUniqueSortedNumbers(formats.map((format) => Number(format.abr)));
  const normalized = bitrates.filter((bitrate) => bitrate >= 64).slice(0, 6);

  if (normalized.length === 0) {
    normalized.push(320, 256, 192, 128);
  }

  return [
    { value: "best", label: "Best audio" },
    ...normalized.map((bitrate) => ({
      value: String(Math.round(bitrate)),
      label: `${Math.round(bitrate)} kbps`
    }))
  ];
}

export function buildFormatArguments({ format, quality }: FormatArgInput): string[] {
  if (format === "mp3" || format === "wav") {
    const args = ["--format", "bestaudio/best", "--extract-audio", "--audio-format", format];
    if (quality !== "best") {
      args.push("--audio-quality", quality);
    } else {
      args.push("--audio-quality", "0");
    }
    return args;
  }

  const extension = format === "webm" ? "webm" : "mp4";
  const audioExt = extension === "mp4" ? "m4a" : "webm";

  if (quality === "best") {
    return [
      "--format",
      `bv*[ext=${extension}]+ba[ext=${audioExt}]/b[ext=${extension}]/best`,
      "--merge-output-format",
      extension
    ];
  }

  return [
    "--format",
    `bv*[ext=${extension}][height<=?${quality}]+ba[ext=${audioExt}]/b[ext=${extension}][height<=?${quality}]/best[height<=?${quality}]`,
    "--merge-output-format",
    extension
  ];
}

export function parseProgressLine(line: string): ProgressData | null {
  if (!line.startsWith("download:")) {
    return null;
  }

  const parts = line.replace("download:", "").split("|");
  if (parts.length < 7) {
    return null;
  }

  const percent = Number(parts[4].replace("%", "").trim()) || 0;
  const downloadedBytes = Number(parts[1]) || 0;
  const totalBytes = Number(parts[2]) || Number(parts[3]) || 0;
  const speed = Number(parts[5]) || 0;
  const eta = Number(parts[6]) || 0;

  return {
    status: parts[0].trim(),
    percent,
    downloadedBytes,
    totalBytes,
    speed,
    eta
  };
}

export function buildMetadataPayload(url: string, info: YtDlpInfo): MetadataPayload {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const safeTitle = sanitizeFilename(info.title || "download");

  return {
    title: info.title || "Untitled video",
    uploader: info.uploader || info.channel || "Unknown creator",
    duration: Number(info.duration) || 0,
    thumbnail: info.thumbnail || "",
    webpageUrl: info.webpage_url || url,
    suggestedFilename: safeTitle,
    availableVideoQualities: {
      mp4: extractVideoQualities(formats, "mp4"),
      webm: extractVideoQualities(formats, "webm")
    },
    availableAudioQualities: extractAudioQualities(formats)
  };
}

export function getDurationLabel(seconds: number | null | undefined): string {
  if (!seconds) return "0:00";
  const total = Number(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s]
    .filter((v, i) => v > 0 || i > 0)
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

export function getFileSizeLabel(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function getSpeedLabel(bps: number | null | undefined): string {
  return bps ? `${getFileSizeLabel(bps)}/s` : "---";
}

export function getEtaLabel(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "---";
  if (seconds <= 0) return "finishing";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
