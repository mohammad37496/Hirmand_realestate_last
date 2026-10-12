import { AdminPropertiesPage as Impl } from "./_admin_impl";

export function AdminPropertiesPage({ mode = "admin" }: { mode?: "admin" | "staff" }) {
  return <Impl mode={mode} />;
}
