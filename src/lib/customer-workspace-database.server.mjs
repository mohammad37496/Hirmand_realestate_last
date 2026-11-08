import { createError } from "h3";

/** Never present an unavailable account database as a valid empty workspace. */
/** @param {string} source @returns {void} */
export function requireCustomerWorkspaceDatabase(source) {
  if (source === "unconfigured") {
    throw createError({
      statusCode: 503,
      statusMessage: "Workspace database is unavailable",
    });
  }
}
