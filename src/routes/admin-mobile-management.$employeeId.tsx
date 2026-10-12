import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { AdminMobileEmployeePage } from "@/components/hirmand/admin-mobile-management";

export const Route = createFileRoute("/admin-mobile-management/$employeeId")({
  component: AdminMobileEmployeeRoute,
  head: ({ params }) => ({
    meta: [
      { title: `مدیریت تلفن همراه — ${params.employeeId} | ${SITE.nameFa}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AdminMobileEmployeeRoute() {
  const { employeeId } = Route.useParams();
  return <AdminMobileEmployeePage employeeId={employeeId} />;
}
