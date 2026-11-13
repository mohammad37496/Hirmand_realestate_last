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

- Allowed origins: `https://hirmandrealestate.ir` and
  `https://www.hirmandrealestate.ir` (remove any origin the site does not use).
- Allowed methods: `PUT`, `GET`, `HEAD`.
- Allowed request headers: `Content-Type`.
- Exposed response headers: `ETag`, `Content-Length`.
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
cached in-process for five minutes to avoid a full listing on every dashboard
refresh. PostgreSQL database size is reported only when the configured backend
is PostgreSQL; the PGlite preview intentionally reports it as unavailable.

See [the storage backup and restore runbook](./storage-backup-and-restore.md).
This feature does not enable provider backups or claim a restore has been tested.
