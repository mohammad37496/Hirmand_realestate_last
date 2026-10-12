import { createFileRoute } from "@tanstack/react-router";
import { CommissionCalculator } from "@/components/hirmand/commission-calculator";
import { FinanceToolPage } from "@/components/hirmand/finance-tool-page";
import { SITE } from "@/lib/site";

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
  component: CommissionPage,
});

function CommissionPage() {
  return (
    <FinanceToolPage tool="commission">
      <CommissionCalculator />
    </FinanceToolPage>
  );
}
