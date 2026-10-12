import { createFileRoute } from "@tanstack/react-router";
import { DepositCalculator } from "@/components/hirmand/finance-tools";
import { FinanceToolPage } from "@/components/hirmand/finance-tool-page";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/tools/deposit")({
  head: () => ({
    meta: [
      { title: `محاسبه‌گر سود سپرده | ${SITE.nameFa}` },
      {
        name: "description",
        content: "محاسبه سود ماهانه، سود کل و مبلغ نهایی سپرده با نرخ و مدت قابل تنظیم.",
      },
    ],
  }),
  component: DepositPage,
});

function DepositPage() {
  return (
    <FinanceToolPage tool="deposit">
      <DepositCalculator />
    </FinanceToolPage>
  );
}
