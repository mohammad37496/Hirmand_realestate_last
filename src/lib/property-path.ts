import type { PropertyCardData } from "@/lib/properties";

export function propertyPath(property: Pick<PropertyCardData, "id" | "slug">): string {
  const slug = property.slug.trim();
  if (slug) return `/properties/${encodeURIComponent(slug)}`;
  const id = property.id.trim();
  return id ? `/file/${encodeURIComponent(id)}` : "/properties";
}
