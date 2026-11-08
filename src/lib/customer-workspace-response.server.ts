import { setResponseStatus, type H3Event } from "h3";

export function customerWorkspaceStatusText(statusCode: number) {
  if (statusCode === 400) return "Bad Request";
  if (statusCode === 401) return "Unauthorized";
  if (statusCode === 403) return "Forbidden";
  if (statusCode === 409) return "Conflict";
  if (statusCode === 503) return "Service Unavailable";
  return "Internal Server Error";
}

/** Preserve private response headers when H3 would otherwise replace an error response. */
export function customerWorkspaceHttpError(event: H3Event, error: unknown) {
  const requestedStatus =
    error && typeof error === "object" && "statusCode" in error
      ? Number(error.statusCode)
      : 0;
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;

  const statusText = customerWorkspaceStatusText(statusCode);
  if (statusCode >= 500) console.error("[customer-workspace] request failed", error);
  setResponseStatus(event, statusCode, statusText);
  const message = statusCode === 401 ? "Unauthorized"
    : statusCode === 403 ? "Forbidden"
      : statusCode === 409 ? "Workspace account changed"
        : statusCode === 400 ? "Invalid workspace request"
          : "Workspace service unavailable";
  return { error: true, status: statusCode, statusText, message };
}
