import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/hirmand/finance-tools";
import { FinanceToolPage } from "@/components/hirmand/finance-tool-page";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/tools/loan")({
  head: () => ({
    meta: [
      { title: `محاسبه‌گر اقساط وام | ${SITE.nameFa}` },
      {
        name: "description",
        content: "محاسبه قسط ماهانه، سود کل و جمع پرداختی وام با روش اقساط مساوی یا سود ساده.",
      },
    ],
  }),
  component: LoanPage,
});

function LoanPage() {
  return (
    <FinanceToolPage tool="loan">
      <LoanCalculator />
    </FinanceToolPage>
  );
}
