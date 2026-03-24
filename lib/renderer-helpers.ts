import type { HistoryEntry, MetadataPayload, ProgressSnapshot, QualityOption } from "../src/types";

export interface PendingEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  format: string;
  quality: string;
  savePath: string;
}

export interface SidebarItem {
  id: string;
  title: string;
  format: string;
  quality: string;
  status: string;
  thumbnail: string;
  time: string;
  type: "active" | "queued" | "history";
  path: string;
}

export const DEFAULT_ACCENT = "#3b82f6";

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function getYouTubeVideoId(url: string | null | undefined): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }

    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeHexColor(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_ACCENT;
  }

  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return DEFAULT_ACCENT;
  }

  const raw = match[1].toLowerCase();
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw;
  return `#${expanded}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(baseHex: string, targetHex: string, amount: number): string {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  return rgbToHex(
    base.r + (target.r - base.r) * amount,
    base.g + (target.g - base.g) * amount,
    base.b + (target.b - base.b) * amount
  );
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export function buildSidebarItems(
  activeDownloads: Map<string, ProgressSnapshot>,
  pendingDownloads: PendingEntry[],
  history: HistoryEntry[]
): SidebarItem[] {
  const items: SidebarItem[] = [];

  for (const task of activeDownloads.values()) {
    items.push({
      id: task.id,
      title: task.title,
      format: task.format,
      quality: task.quality,
      status: task.status || "downloading",
      thumbnail: "",
      time: "",
      type: "active",
      path: ""
    });
  }

  for (const entry of pendingDownloads) {
    items.push({
      id: entry.id,
      title: entry.title,
      format: entry.format,
      quality: entry.quality,
      status: "queued",
      thumbnail: entry.thumbnail || "",
      time: "",
      type: "queued",
      path: ""
    });
  }

  for (const entry of history) {
    items.push({
      id: entry.id,
      title: entry.title,
      format: entry.format,
      quality: entry.quality,
      status: entry.status,
      thumbnail: "",
      time: timeAgo(entry.completedAt),
      type: "history",
      path: entry.outputPath || entry.savePath
    });
  }

  return items;
}

export function filterByTab(items: SidebarItem[], activeTab: string): SidebarItem[] {
  switch (activeTab) {
    case "active":
      return items.filter((i) => i.type === "active");
    case "queued":
      return items.filter((i) => i.type === "queued");
    case "completed":
      return items.filter((i) => i.status === "completed");
    default:
      return items;
  }
}

export function getQualityOptionsForFormat(metadata: MetadataPayload | null, format: string): QualityOption[] {
  if (!metadata) return [{ value: "best", label: "Best available" }];
  if (format === "mp3" || format === "wav") return metadata.availableAudioQualities;
  const options = metadata.availableVideoQualities[format as "mp4" | "webm"] || [];
  return options.length > 0 ? options : [{ value: "best", label: "Best available" }];
}
