import { createFileRoute } from "@tanstack/react-router";
import { RahnRentConverter } from "@/components/hirmand/rahn-rent-converter";
import { FinanceToolPage } from "@/components/hirmand/finance-tool-page";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/tools/rahn-rent")({
  head: () => ({
    meta: [
      { title: `محاسبه‌گر رهن به اجاره | ${SITE.nameFa}` },
      {
        name: "description",
        content: "محاسبه آنلاین تبدیل رهن به اجاره و ترکیب مبلغ رهن و اجاره در املاک هیرمند.",
      },
    ],
  }),
  component: RahnRentPage,
});

function RahnRentPage() {
  return (
    <FinanceToolPage tool="rahn">
      <RahnRentConverter />
    </FinanceToolPage>
  );
}
