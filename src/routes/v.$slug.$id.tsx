import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { getPublishedProperty, getPublishedPropertyById } from "@/lib/properties";
import { propertyHead } from "@/lib/seo";

export const Route = createFileRoute("/v/$slug/$id")({
  loader: async ({ params }) => {
    let property = await getPublishedProperty({ data: { slug: params.slug } });
    if (!property && params.id) {
      property = await getPublishedPropertyById({ data: { id: params.id } });
    }
    if (!property) throw notFound();

    throw redirect({
      to: "/properties/$slug",
      params: { slug: property.slug },
      replace: true,
    });
  },
  head: ({ params }) => propertyHead(null, params.slug),
  component: LegacyVPropertyRoutePage,
});

function LegacyVPropertyRoutePage() {
  return null;
}
