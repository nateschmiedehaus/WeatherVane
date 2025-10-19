import type { WeatherStory } from "../types/stories";

const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+(?=[A-Z0-9])/u;
const BULLET_PREFIX_REGEX = /^[\s\u2022\u2023\u25E6\u2043\u2219·•\-–—]+/u;

function normaliseSegment(segment: string): string {
  const trimmed = segment.replace(BULLET_PREFIX_REGEX, "").trim();
  if (!trimmed) {
    return "";
  }
  const compact = trimmed.replace(/\s+/g, " ").trim();
  return compact.length ? compact : "";
}

function extractSegments(detail: string): string[] {
  return detail
    .split(/\r?\n/u)
    .flatMap((line) => line.split(SENTENCE_SPLIT_REGEX))
    .map((segment) => normaliseSegment(segment))
    .filter((segment) => segment.length >= 12);
}

export function buildStoryHighlights(
  detail: string | null | undefined,
  options: { limit?: number } = {},
): string[] {
  const limit = Math.max(1, options.limit ?? 3);
  if (typeof detail !== "string" || detail.trim() === "") {
    return [];
  }

  const segments = extractSegments(detail);
  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const raw of segments) {
    const candidate = raw.endsWith(".") ? raw.slice(0, -1) : raw;
    if (!candidate || seen.has(candidate.toLowerCase())) {
      continue;
    }
    seen.add(candidate.toLowerCase());
    highlights.push(candidate);
    if (highlights.length >= limit) {
      break;
    }
  }

  return highlights;
}

export function formatStoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function buildStorySharePayload(
  story: WeatherStory,
  options: { highlights?: string[]; horizonDays?: number } = {},
): string {
  const highlights =
    options.highlights ?? buildStoryHighlights(story.detail, { limit: 3 });
  const lines: string[] = [];

  lines.push(`${story.title} — ${story.channel} (${story.confidence})`);
  lines.push(`Plan date: ${formatStoryDate(story.plan_date)}`);
  lines.push("");
  lines.push(story.summary.trim());

  if (highlights.length > 0) {
    lines.push("");
    lines.push("Highlights:");
    highlights.forEach((highlight) => {
      lines.push(`• ${highlight}`);
    });
  }

  if (story.detail.trim() && highlights.length === 0) {
    lines.push("");
    lines.push(story.detail.trim());
  }

  if (typeof options.horizonDays === "number" && Number.isFinite(options.horizonDays)) {
    lines.push("");
    lines.push(`Horizon: ${options.horizonDays} days`);
  }

  return lines.join("\n").trimEnd();
}
