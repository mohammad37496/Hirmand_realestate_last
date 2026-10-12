import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { AdminPropertiesPage } from "@/components/hirmand/admin-properties-page";

function StaffPage() {
  return <AdminPropertiesPage mode="staff" />;
}

export const Route = createFileRoute("/staff")({
  component: StaffPage,
  head: () => ({
    meta: [
      { title: `پنل کارکنان | ${SITE.nameFa}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
