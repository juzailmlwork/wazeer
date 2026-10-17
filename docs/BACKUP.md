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

The card leads with **Last backed up**, the timestamp of the newest stored backup, in green when
it is under 30 hours old and amber with a warning when it is older. That threshold matches
`BACKUP_MAX_AGE_HOURS`, so the page flags a missed night at the same point the SMS alert does.
Until remote storage is configured the card only says *"Remote storage isn't set up yet."*

After every upload the stored object's size is read back with `HeadObject` and compared against
the bytes the zip writer actually produced. A multipart upload that lands short otherwise looks
like a success — and pruning would then trust it enough to delete older copies.

---

## The nightly backup

Live since 17 Oct 2026.

| | |
|---|---|
| Bucket | `s3://pd-lifeos-backup/wazeer-backup/` (us-east-1) |
| When | `20 18 * * *` UTC in root's crontab = **23:50 Asia/Colombo**, which has no DST |
| Retention | the newest **15** (`BACKUP_KEEP`) |
| Log | `/var/log/wazeer-backup.log` |
| Alerts | SMS to `BACKUP_ALERT_SMS` on failure, plus a daily freshness check |
| First run | 78 KB, 1,163 records, 1 file |

```bash
crontab -l | grep wazeer                      # the two jobs
tail -20 /var/log/wazeer-backup.log           # what the last runs said
cd /root/jusail/wazeer/backend && npm run backup:now     # run one by hand
cd /root/jusail/wazeer/backend && npm run backup:check   # report freshness now
```

**Cron owns the schedule, not the backend.** A timer inside the server process dies with the
process and says nothing when it stops; cron keeps its own clock, writes to a log, and is
visible in `crontab -l`. `scripts/run-cloud-backup.js` reuses the app's own backup code, so a
scheduled backup and a Settings click produce byte-identical archives.

**`node` is pinned to an absolute path** in the crontab
(`/root/.nvm/versions/node/v20.20.1/bin/node`). cron's default `PATH` finds `/usr/bin/node`,
which is **v18.19.1**, while pm2 runs the backend on nvm's **v20.20.1**. Pinning keeps the
backup on the same runtime as the app. **If node is ever upgraded, update these two cron lines.**

Exit codes: `0` success, `1` failure, `2` remote storage not configured. Every non-zero exit
sends an SMS first.

## Retention: newest 15, never by age

`BACKUP_KEEP=15` — one copy a night, so roughly the last fifteen days, at about 1.2 MB in total
today.

Deletion is **not** an S3 lifecycle rule and **not** by age. An age rule cannot tell a healthy
rotating bucket from one where the backup has been failing all week; in the second case it
deletes the last good copies on schedule and leaves nothing. Retention is by count instead, so a
run of failures simply means nothing new arrives and the existing fifteen stay put.

Pruning also only runs **after** that night's upload has verified its stored size, so a bad
night can never trigger the deletion of good copies. Verified: an upload to a non-existent
bucket and an upload to an unreachable endpoint both exit 1 and delete nothing.

## Alerts

Two independent triggers, both SMS via Notify.lk — the same account the LMS backup jobs use.

| Trigger | When | Catches |
|---|---|---|
| `run-cloud-backup.js` | the nightly run exits non-zero | the zip, the upload or the prune failed; credentials revoked; bucket gone |
| `check-cloud-backup.js` | 07:10 Asia/Colombo daily | the nightly job never ran at all |

The second matters because a job that fails can alert, but a job that never fires cannot. The
check reads the bucket, so it stays honest even if cron stops, the script is deleted, or the
server was down at 23:50. It alerts when the newest backup is older than `BACKUP_MAX_AGE_HOURS`
(30 — enough to catch one missed night by the next morning) and exits 1, so it also works as a
probe for any external monitor.

**Alerting never changes a run's outcome.** An undeliverable SMS must not turn a good backup
into a failed one, nor mask the original error, so every failure path in `services/alert.js`
warns and resolves. With no recipient or no API key configured it prints the message to the log
and carries on.

```bash
# send yourself a test message
cd /root/jusail/wazeer/backend && node -e "require('dotenv').config();require('./services/alert').alert('test alert').then(r=>console.log(r))"
```

Delivery depends on the sender ID: `SMS_SENDER_ID` is `NotifyDEMO`, Notify.lk's shared testing
sender. The API accepts messages through it, but delivery to arbitrary numbers is not
guaranteed. For alerts you can rely on, register a sender ID on the Notify.lk account and set
`SMS_SENDER_ID` to it. No code changes needed.

## Bucket setup

Backups share `pd-lifeos-backup` with LifeOS, under their own `wazeer-backup/` prefix. The
bucket already blocks all public access and has AES256 default encryption.

A dedicated bucket would be tidier — one bad policy or lifecycle rule currently reaches two
businesses' backups. To move: create the bucket, change `S3_BUCKET` in `backend/.env`, restart
the backend, run `npm run backup:now`, and copy the old objects across if you want the history.

**Least-privilege IAM policy**, if the shared account-wide key is ever replaced with a scoped one:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::pd-lifeos-backup/wazeer-backup/*" },
    { "Effect": "Allow", "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::pd-lifeos-backup",
      "Condition": { "StringLike": { "s3:prefix": "wazeer-backup/*" } } }
  ]
}
```

`s3:DeleteObject` is needed for pruning. Without it the backup still succeeds and old copies
just accumulate — `run-cloud-backup.js` reports the prune failure and exits non-zero.

The app never reads backups back from the bucket. To restore from one, download it from the AWS
console and use **Restore** in Settings.

**This app reads `S3_BUCKET` / `S3_REGION`.** LifeOS uses `BACKUP_S3_BUCKET` /
`BACKUP_S3_REGION` for the same thing. Do not mix them: setting only the `BACKUP_S3_*` names
here leaves remote storage quietly switched off.


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
| `backend/scripts/run-cloud-backup.js` | The nightly cron entry point: upload, verify, prune, alert |
| `backend/scripts/check-cloud-backup.js` | Freshness watchdog, run every morning |
| `backend/services/alert.js` | Notify.lk SMS, used by both scripts |
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
- **A backup is not a point-in-time snapshot.** There are no MongoDB transactions (the local
  Mongo is standalone), so a backup taken while people are writing can be a few seconds
  inconsistent across collections. At 23:50 the plant is closed, which is most of why that hour
  was chosen.
- **The nightly job and the backend hold separate locks.** `exclusive()` is per-process, so a
  cron backup and a restore started from Settings at the same moment would not see each other.
  In practice nobody restores at ten to midnight.

## Manual recovery (if the app itself won't start)

A backup zip can be restored with standard MongoDB tools. `mongoimport` reads the
`.ndjson` files directly, keeping ObjectIds, Dates and int/double types (verified with mongo:7):

```bash
unzip wazeer-backup-XXXX.zip -d restore
for f in restore/db/*.ndjson; do
  mongoimport --uri "$MONGODB_URI" --collection "$(basename "$f" .ndjson)" --drop --file "$f"
done
cp restore/uploads/* /root/jusail/wazeer/backend/uploads/
pm2 restart wazeer-backend   # the app recreates any indexes on start
```

`--drop` replaces each collection. Unlike the in-app restore, collections that aren't in the zip
are left as they are. The safety snapshots in `backend/backups/` use the same format.
