# Backup, Restore & Remote Storage

Reference for the backup system behind **Settings** (super admin only). Written so a future
maintainer can operate, debug, or extend it without re-reading all the code.

> **UI rule:** the frontend and every API response call the off-site copy **"remote storage"**.
> Never show the provider (S3/AWS), bucket, region, endpoint, env var names, or raw AWS error
> codes in the browser. Those details go to the server log only (`[remote-backup]` lines).

---

## What a backup contains

One `.zip`:

| Entry | Contents |
|---|---|
| `manifest.json` | `{ app: "wazeer", formatVersion: 1, createdAt, database, collections: { name: count }, uploads: { count, bytes } }` |
| `db/<collection>.ndjson` | Every document, one per line, **canonical Extended JSON**. Keeps ObjectIds, Dates and int/double types exactly. |
| `uploads/<storedName>` | Every file in the upload folder (images from the Files tab) |

- It covers **every** non-system collection in the database, not just the ones with Mongoose
  models, so collections added later are picked up automatically.
- It includes `users` with **bcrypt password hashes**. Treat backup files as sensitive.
- Size today: roughly 3 MB for about 600 records and 2 images. Images dominate the size.

Filename: `wazeer-backup-<ISO timestamp>.zip`.

## Operating it

### Download
Settings → **Download Backup**. The page asks for a single-use download token (60 s), then
navigates to `/api/backup/download?token=…`. That lets the browser stream the zip straight to
disk rather than into page memory.

### Restore
Settings → **Restore from Backup** → choose the zip → type `RESTORE` → **Restore Backup**.

What happens, in order (`services/backup.js → restoreBackup`):

1. **Inspect.** The whole zip is read and validated. **Nothing is changed yet.** It's rejected (HTTP 400) if:
   - the file isn't a zip, or `manifest.json` is missing or has the wrong `app` or format version
   - any record fails to parse
   - a collection's record count differs from the manifest
   - the zip has entries not listed in the manifest, or any unexpected entry (this blocks path traversal)
   - an upload entry is over 100 MB
2. **Safety snapshot.** A full backup of the *current* state is written to
   `backend/backups/pre-restore-<timestamp>.zip`. The newest 5 are kept.
3. **Apply.**
   - Images are extracted to a staging folder first.
   - Every current collection is emptied with `deleteMany`, which keeps existing indexes.
   - The backup's documents are inserted in batches of 500.
   - `createIndexes()` runs for every model.
   - The upload folder is swapped for the staged files.
4. **On any failure in step 3,** the safety snapshot is applied automatically. The user sees:
   *"Restore failed, so your data was put back exactly as it was."*
   If the rollback itself fails, the error message gives the snapshot's path on the server.

**Restore replaces everything.** That includes users, so accounts or password changes made after
the backup are lost. Collections that exist now but aren't in the backup end up empty.

Only one backup or restore runs at a time. Others get HTTP 409.

### Remote storage (S3 underneath)
Settings → **Remote Storage** → **Store Backup Remotely**. It streams a backup to the bucket as a
multipart upload, with no temp file on disk, and lists the 20 newest stored backups.

Until it's configured, the card only says *"Remote storage isn't set up yet."*

## Setting up remote storage (when credentials arrive)

Add to `backend/.env`, then run `pm2 restart wazeer-backend`:

```
S3_BUCKET=<bucket>
S3_REGION=<region, e.g. ap-south-1>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
# optional
S3_PREFIX=wazeer-backups/        # "folder" inside the bucket (default shown)
S3_ENDPOINT=                     # only for S3-compatible services (MinIO, R2…); leave unset for AWS
```

The template is in `backend/.env.example`. Check it worked: the card shows the
**Store Backup Remotely** button. If it fails, look for `[remote-backup]` in
`pm2 logs wazeer-backend`.

**Recommended bucket setup:**
- Block all public access.
- Turn on versioning.
- Add a lifecycle rule to expire old backups, e.g. after 90 days.

**Least-privilege IAM policy** for the key, replacing `BUCKET` and the prefix:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::BUCKET/wazeer-backups/*" },
    { "Effect": "Allow", "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::BUCKET",
      "Condition": { "StringLike": { "s3:prefix": "wazeer-backups/*" } } }
  ]
}
```

The app never reads backups back from the bucket. To restore from one, download it from the AWS
console and use **Restore** in Settings.

## API reference

All routes are under `/api/backup`. Every route requires a super admin JWT, except
`/download`, which uses its token instead.

| Method | Path | Result |
|---|---|---|
| GET | `/summary` | `{ collections: {name: count}, uploads: {count, bytes}, remote: {configured} }` |
| POST | `/download-token` | `{ token }`: single use, valid 60 s |
| GET | `/download?token=` | zip stream |
| POST | `/restore` | multipart field `backup` (max 5 GB) → `{ backupCreatedAt, collections, uploads, safetySnapshot }` |
| GET | `/remote` | `{ configured, backups: [{ name, size, lastModified }], error? }` |
| POST | `/remote` | `{ name, collections, uploads }` |

Error statuses:
- **400:** a bad backup file, or a user-facing message
- **403:** not super admin
- **409:** a backup or restore is already running
- **500:** unexpected; the details are in the server log under `[backup]`

## Code map

| File | Role |
|---|---|
| `backend/services/backup.js` | Zip writer and reader, validation, restore, rollback, lock, snapshot pruning |
| `backend/services/s3.js` | Remote storage: env config, streaming upload, listing, neutral errors |
| `backend/routes/backup.js` | HTTP routes, download tokens, restore upload |
| `backend/config/paths.js` | `UPLOAD_DIR` (default `backend/uploads`) and `BACKUP_DIR` (default `backend/backups`), both overridable by env |
| `frontend/src/components/Settings/SettingsTab.jsx` | The Settings page |

`backend/uploads/` and `backend/backups/` are gitignored.

Implementation notes worth keeping:
- **Every wait inside `writeBackup` races a failure signal.** archiver's `finalize()` never
  settles if the destination stops reading (a closed browser tab, or rejected credentials). A hung
  backup would hold the lock forever. Both cases are covered by tests.
- **`deleteMany`, not `drop`, before inserting,** so unique indexes (e.g. `users.username`) are
  enforced *during* the insert. Duplicate data then fails the restore and triggers rollback.
- **There are no MongoDB transactions** (the local Mongo is standalone). Consistency comes from
  validating before changing anything, plus snapshot-and-rollback. A backup taken while people are
  writing can be a few seconds inconsistent across collections.

## Testing

Tested on 2026-09-19 against **throwaway** services, never the live database:
- a `mongo:7` container on port 27020, loaded with a read-only copy of the real data
- MinIO (`quay.io/minio/minio`; the Docker Hub image is no longer published) as the S3 stand-in
- a second backend on port 7299, and Vite on port 4299 proxied to it

63 API checks plus a browser run, all passing. They covered:
- permissions (403/401)
- summary and manifest counts
- a byte-for-byte round trip after deleting, changing and adding records and images
- index and type preservation
- 10 kinds of malformed or malicious zips, each rejected with the data unchanged
- mid-restore failure rolling back
- concurrent restores (409)
- a download aborted by the client releasing the lock
- snapshot pruning
- remote upload, list, and restore-from-remote
- wrong credentials: a neutral error, no hang
- not configured

To re-test, recreate the same setup, point a backend at it with env overrides (`PORT`,
`MONGODB_URI`, `UPLOAD_DIR`, `BACKUP_DIR`, `S3_*`, `AWS_*`), and exercise the endpoints above.
Start only one backend at a time against an empty database: they race to seed the default users.

## Known limits

- **Restores through the public site are capped at 100 MB.** fwr.limecodelabs.com's nginx has
  `client_max_body_size 100M`. Raise it in `/etc/nginx/sites-enabled/fwr` once backups grow near
  that.
- **Upgrade Node before 2027.** AWS SDK releases after January 2027 require Node ≥ 22; the server
  runs Node 20.
- **Remote uploads are manual.** A scheduled daily upload would be a small addition on top of
  `services/s3.js → uploadBackup()`.

## Manual recovery (if the app itself won't start)

A backup zip can be restored with standard MongoDB tools. `mongoimport` reads the
`.ndjson` files directly, keeping ObjectIds, Dates and int/double types (verified with mongo:7):

```bash
unzip wazeer-backup-XXXX.zip -d restore
for f in restore/db/*.ndjson; do
  mongoimport --uri "$MONGODB_URI" --collection "$(basename "$f" .ndjson)" --drop --file "$f"
done
cp restore/uploads/* /root/wazeer/backend/uploads/
pm2 restart wazeer-backend   # the app recreates any indexes on start
```

`--drop` replaces each collection. Unlike the in-app restore, collections that aren't in the zip
are left as they are. The safety snapshots in `backend/backups/` use the same format.
