import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { AdminPropertiesPage } from "@/components/hirmand/admin-properties-page";

function AdminPage() {
  return (
    <>
      <AdminPropertiesPage />
    </>
  );
}

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: `مدیریت فایل‌ها | ${SITE.nameFa}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
