import { createError } from "h3";

export function assertAdminDatabaseConfigured(source: string, statusMessage: string): void {
  if (source === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage });
  }
}
