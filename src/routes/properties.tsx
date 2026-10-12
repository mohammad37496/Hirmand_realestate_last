import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for everything under `/properties`.
 *
 * The listing lives on the index route (`properties.index.tsx`) and the file
 * detail page on the child route (`properties.$slug.tsx`). This route used to
 * hold the listing itself, which made the whole section a dead end: a child
 * route only renders inside its parent's `<Outlet/>`, so `/properties/<slug>`
 * changed the URL, ran the detail loader and still painted the listing — the
 * exact "clicking a file does nothing" report. Keep this file free of UI.
 */
export const Route = createFileRoute("/properties")({
  component: PropertiesLayout,
});

function PropertiesLayout() {
  return <Outlet />;
}
