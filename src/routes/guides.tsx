import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Shared route boundary for the guide library and individual articles. */
export const Route = createFileRoute("/guides")({
  component: GuidesLayout,
});

function GuidesLayout() {
  return <Outlet />;
}
