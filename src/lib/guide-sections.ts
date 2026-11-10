export type GuideSection = {
  heading: string;
  paragraphs: string[];
};

export function normalizeGuideSections(value: unknown): GuideSection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 48).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const heading = typeof record.heading === "string" ? record.heading.trim() : "";
    const paragraphs = Array.isArray(record.paragraphs)
      ? record.paragraphs
          .filter((paragraph): paragraph is string => typeof paragraph === "string")
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return heading && paragraphs.length ? [{ heading, paragraphs }] : [];
  }).slice(0, 12);
}
