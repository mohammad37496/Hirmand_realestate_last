/**
 * Shared size policy for property media uploads.
 *
 * Keep browser preflight and server enforcement on the same values. Files over
 * 100 MiB are finalized through the disk-backed upload pipeline rather than
 * being assembled into a full-size in-memory Buffer.
 */
export const MAX_PROPERTY_GALLERY_IMAGE_BYTES = 1024 * 1024 * 1024;
export const MAX_PROPERTY_GALLERY_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_PROPERTY_FLOOR_PLAN_BYTES = 15 * 1024 * 1024;
export const MAX_PROPERTY_MEDIA_IN_MEMORY_COMPLETION_BYTES = 100 * 1024 * 1024;
