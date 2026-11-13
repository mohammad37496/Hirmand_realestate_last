# Liara direct-upload rollout

Direct uploads are deliberately disabled by default. The application issues a
15-minute, single-object S3 Signature V4 PUT URL only after the existing upload
session, route scope, same-origin guard, permissions and rate limit have passed.
The browser sends the file to Liara; the completion request then checks the
object's HEAD metadata and reads only its first 32 bytes before writing the
business record to PostgreSQL.

The presigned signature also binds the browser-generated `Content-Length` and
`Content-Type` headers, preventing the client from expanding the declared size
after the server has applied its route-specific file-size limit.
The browser supplies `Content-Length` automatically; application code must not
try to set that forbidden request header manually.
Browser-side canvas optimization is limited to JPEG files and applies EXIF
orientation before re-encoding. PNG, GIF, WebP and AVIF are uploaded unchanged so
animated frames and format-specific metadata are preserved.
The signed URL can be reused until expiry, so it writes only to a private
staging key. After byte verification, the server copies that object to its
final key and removes the staging object; the browser URL cannot overwrite the
published media.
Staging cleanup waits until the signed URL expiry plus the upload-session
retention window. A session is atomically marked expired before its staging
object is deleted, so a concurrent retry cannot receive a fresh URL for an
object being cleaned.

## Bucket CORS

Before enabling the feature, configure the Liara bucket's CORS policy for the
exact browser origins that will upload. At minimum:

- Keep the bucket private. The site reads final Liara objects through its
  same-origin server routes, which apply the existing publication, owner and
  admin checks. CORS permits the signed browser PUT; it does not make objects
  private or public. Do not enable public bucket access to make uploads work.
- Keep `staging/` outside every public media route. A presigned PUT grants write
  access to one staging key until expiry; it does not grant read access. Aborted
  direct sessions are retired immediately, while their staging object is left
  for cleanup after the URL expiry and retention window so a late PUT cannot
  recreate an orphan after deletion.

- Allowed origins: `https://hirmandrealestate.ir` and
  `https://www.hirmandrealestate.ir` (remove any origin the site does not use).
- Allowed methods: `PUT`.
- Allowed request headers: `Content-Type`.
- No exposed response headers are required; the browser upload client reads only
  the PUT status and upload progress. Final object reads stay server-side.
- Max age: 600 seconds.

If direct uploads are enabled in a non-production preview, add that exact
preview origin separately. Do not use `*` for allowed origins. CORS is not an
authorization mechanism; each PUT still requires the short-lived signed URL.

## Enablement checklist

1. Configure the bucket CORS policy above in Liara.
2. Confirm `LIARA_ENDPOINT`, `LIARA_BUCKET_NAME`, `LIARA_ACCESS_KEY` and
   `LIARA_SECRET_KEY` are set as server-only environment variables.
3. Test a small image and audio file from the production origin, then verify
   that the upload completion returns a stored URL and the object can be read.
4. Only then set `LIARA_DIRECT_UPLOAD_ENABLED=true` and redeploy.

Property photos, customer-submitted photos, area images and music use direct
PUT when enabled. Property videos deliberately retain the existing server-side
chunked path so video watermarking still happens before the final URL is
published. If the flag is absent or false, all routes retain the existing
chunked upload path.

## Storage telemetry

The admin media-health scan lists up to 10 pages of 1,000 objects from Liara and
marks the result incomplete if the bucket has more objects. The inventory is
bounded to five seconds and 4 MiB per page, and rejects malformed object sizes
instead of reporting a partial total as complete. It is cached in-process for
five minutes to avoid a full listing on every dashboard refresh. PostgreSQL
database size is reported only when the configured backend is PostgreSQL; the
PGlite preview intentionally reports it as unavailable.

See [the storage backup and restore runbook](./storage-backup-and-restore.md).
This feature does not enable provider backups or claim a restore has been tested.
