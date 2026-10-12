import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { AdminMobileManagementPage } from "@/components/hirmand/admin-mobile-management";

export const Route = createFileRoute("/admin-mobile-management")({
  component: AdminMobileManagementPage,
  head: () => ({
    meta: [
      { title: `مدیریت تلفن همراه | ${SITE.nameFa}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
