# Storage backup and restore runbook

The application has two independent durable stores. PostgreSQL contains
properties, customer submissions, leads, music metadata and the business
references to media. Liara Object Storage contains the image, audio and video
bytes. A recoverable system needs a backup of both stores; neither one replaces
the other.

## Current boundary

The admin JSON export is a selected business-data export, not a full database
backup and not an object-storage backup. It intentionally excludes Object
Storage bytes. The media-health dashboard's Liara inventory is an operational
size/count scan, not a backup or restore point. No provider backup, replication
policy, backup bucket, or restore test is configured by this code change.

## Required production policy

### PostgreSQL

- Enable provider-managed point-in-time recovery where available, or schedule
  encrypted `pg_dump -Fc` backups to a separate account/region.
- Keep at least 7 daily and 4 weekly restore points, with access restricted to
  the database operators.
- Include the migration ledger and the deployment SHA in each backup record.
- Restore into an isolated database, apply only migrations newer than the
  snapshot, and verify core table counts, foreign keys, and the admin backup
  verification checks before allowing traffic.

### Liara Object Storage

- Mirror the final object namespace to a separate bucket and preferably a
  separate account or region using an S3-compatible replication/sync job.
- Preserve object keys, content type and metadata. Compare object counts and
  byte totals against a complete `ListObjectsV2` inventory; use checksums or
  downloaded-byte verification for integrity, not ETags alone for multipart
  objects.
- Exclude the `staging/` prefix from long-term backups. It contains temporary
  browser uploads and is cleaned after the signed URL expires and the
  upload-session retention window has elapsed.
- Keep the backup bucket private and its credentials separate from the site's
  runtime credentials. The site should not be able to delete its own backups.
- Restore a sample image, audio file and video to an isolated recovery bucket,
  then verify HEAD metadata and GET bytes before declaring the backup healthy.

## Consistent recovery procedure

1. Record the current deployment SHA and pause media/property writes if a
   point-in-time consistent recovery is required.
2. Restore PostgreSQL to an isolated database and record its snapshot time.
3. Restore the matching Liara object manifest and objects to a private recovery
   bucket, preserving the original keys.
4. Verify every referenced media URL resolves to the restored key; compare
   object size and content type and sample-read the file signatures.
5. Run migrations and the application's database/media integrity checks.
6. Switch the application to the recovered stores only after the checks pass.

Provider credentials and a separate destination bucket are required to
automate these operations. They were not available in this workspace, so this
runbook intentionally does not claim that backups or restores have been
activated or tested.
