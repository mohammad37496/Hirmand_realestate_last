import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Mount Better Auth on the same-origin API path used by authClient.
 * The catch-all is required for endpoints such as get-session, sign-in and
 * OAuth callbacks; without it the browser receives the app's generic 404.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
