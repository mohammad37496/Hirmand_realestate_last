import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for `/consultants`.
 *
 * Same shape as `properties.tsx`: the directory lives on the index route and
 * the profile on the child route. When this file held the directory itself,
 * `/consultants/<id>` swapped the URL, ran the profile loader and still painted
 * the directory — "مشاهده پروفایل" led straight back to the list. A child route
 * only renders inside its parent `<Outlet/>`, so keep this file UI-free.
 */
export const Route = createFileRoute("/consultants")({
  component: ConsultantsLayout,
});

function ConsultantsLayout() {
  return <Outlet />;
}
