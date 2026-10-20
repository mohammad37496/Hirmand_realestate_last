import { defineEventHandler } from "h3";
import { handlePropertyMediaUpload } from "@/lib/property-media-upload.server";

/** Dedicated endpoint for property gallery media and floor plans. */
export default defineEventHandler(handlePropertyMediaUpload);
