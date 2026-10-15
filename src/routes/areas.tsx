import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Shared route boundary for the neighborhood directory and individual areas. */
export const Route = createFileRoute("/areas")({
  component: AreasLayout,
});

function AreasLayout() {
  return <Outlet />;
}
