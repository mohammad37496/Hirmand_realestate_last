import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { getPublishedPropertyById } from "@/lib/properties";

export const Route = createFileRoute("/file/$id")({
  loader: async ({ params }) => {
    const property = await getPublishedPropertyById({ data: { id: params.id } });
    if (!property) throw notFound();

    throw redirect({
      to: "/properties/$slug",
      params: { slug: property.slug },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "در حال انتقال فایل | املاک هیرمند" },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: LegacyPropertyFilePage,
});

function LegacyPropertyFilePage() {
  return null;
}
