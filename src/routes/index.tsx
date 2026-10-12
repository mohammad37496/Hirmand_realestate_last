import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/hirmand/site-page";
import { getPublicFaqs } from "@/lib/site-content";
import { buildFaqJsonLd } from "@/lib/site-content-static";
import { enhancedOrganizationJsonLd, homeHead } from "@/lib/seo";
import { getPublicSiteSettings } from "@/lib/site-settings";

// The marketing shell must render even when the optional property database is
// unavailable. Listings hydrate client-side after the first paint.
export const Route = createFileRoute("/")({
  loader: async () => {
    const [settings, faqs] = await Promise.all([getPublicSiteSettings(), getPublicFaqs()]);
    return { settings, faqs };
  },
  component: Home,
  head: ({ loaderData }) => homeHead(loaderData?.settings),
});

function Home() {
  const { settings, faqs } = Route.useLoaderData();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(enhancedOrganizationJsonLd(settings)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faqs)) }}
      />
      <SitePage initialProperties={[]} announcement={settings.announcementEnabled ? settings.announcementText : ""} faqItems={faqs.map((item) => ({ q: item.question, a: item.answer }))} />
    </>
  );
}
