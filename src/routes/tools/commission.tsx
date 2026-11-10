import { createFileRoute } from "@tanstack/react-router";
import { CommissionCalculator } from "@/components/hirmand/commission-calculator";
import { FinanceToolPage } from "@/components/hirmand/finance-tool-page";
import { SITE } from "@/lib/site";
import { getPublicSiteSettings } from "@/lib/site-settings";

export const Route = createFileRoute("/tools/commission")({
  head: () => ({
    meta: [
      { title: `محاسبه‌گر کمیسیون ملک | ${SITE.nameFa}` },
      {
        name: "description",
        content: "محاسبه آنلاین و تقریبی کمیسیون خرید، فروش و رهن و اجاره ملک در هیرمند.",
      },
    ],
  }),
  loader: async () => {
    const settings = await getPublicSiteSettings();
    return { commissionRates: settings.commissionRates };
  },
  component: CommissionPage,
});

function CommissionPage() {
  const { commissionRates } = Route.useLoaderData();
  return (
    <FinanceToolPage tool="commission">
      <CommissionCalculator rates={commissionRates} />
    </FinanceToolPage>
  );
}
