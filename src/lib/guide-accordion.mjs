/**
 * @template TSection
 * @template TPoint
 * @param {{ sections?: TSection[] | null; points?: TPoint[] | null }} guide
 * @returns {{ sections: TSection[]; points: TPoint[]; sectionCount: number; pointCount: number }}
 */
export function getGuideAccordionContent(guide) {
  const sections = Array.isArray(guide.sections) ? guide.sections : [];
  const points = Array.isArray(guide.points) ? guide.points : [];

  return {
    sections,
    points,
    sectionCount: sections.length,
    pointCount: points.length,
  };
}
