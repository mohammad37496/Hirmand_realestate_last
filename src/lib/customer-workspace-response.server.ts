import { setResponseStatus, type H3Event } from "h3";

/** Preserve private response headers when H3 would otherwise replace an error response. */
export function customerWorkspaceHttpError(event: H3Event, error: unknown) {
  const requestedStatus =
    error && typeof error === "object" && "statusCode" in error
      ? Number(error.statusCode)
      : 0;
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;

  const statusText = statusCode === 400 ? "Bad Request"
    : statusCode === 401 ? "Unauthorized"
      : statusCode === 403 ? "Forbidden"
        : statusCode === 409 ? "Conflict"
          : "Internal Server Error";
  if (statusCode >= 500) console.error("[customer-workspace] request failed", error);
  setResponseStatus(event, statusCode, statusText);
  const message = statusCode === 401 ? "Unauthorized"
    : statusCode === 403 ? "Forbidden"
      : statusCode === 409 ? "Workspace account changed"
        : statusCode === 400 ? "Invalid workspace request"
          : "Workspace service unavailable";
  return { error: true, status: statusCode, statusText, message };
}
