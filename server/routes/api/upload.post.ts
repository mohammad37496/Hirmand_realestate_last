import { defineEventHandler } from "h3";
import { handlePropertyMediaUpload } from "@/lib/property-media-upload.server";

/**
 * Backward-compatible alias for browser tabs and external scripts running an
 * older admin bundle. All new and legacy property uploads now share one
 * dedicated property-media implementation. Music uploads remain isolated on
 * their own endpoint and tables.
 */
export default defineEventHandler(handlePropertyMediaUpload);
