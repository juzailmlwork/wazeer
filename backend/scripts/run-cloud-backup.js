#!/usr/bin/env node
/**
 * One backup to remote storage, then exit — the entry point root's crontab calls nightly.
 *
 *   node scripts/run-cloud-backup.js              # back up, then keep the newest BACKUP_KEEP
 *   node scripts/run-cloud-backup.js --keep 30    # override the retention count for this run
 *   node scripts/run-cloud-backup.js --no-prune   # upload only, delete nothing
 *
 * This reuses the app's own backup code (services/backup.js + services/s3.js), so a scheduled
 * backup and a Settings → "Store Backup Remotely" click produce byte-identical archives in the
 * same format. Nothing is written to this server's disk; the zip is streamed to the bucket.
 *
 * Cron owns the schedule rather than a timer inside the backend: a timer dies with the process
 * that holds it and says nothing when it stops, while cron keeps its own clock, writes to a log,
 * and is visible in `crontab -l`.
 *
 * Exits 0 on success, 1 on failure, 2 if remote storage is not configured. Any non-zero exit
 * sends an SMS first (see services/alert.js).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const remote = require('../services/s3');
const { alert } = require('../services/alert');

const DEFAULT_KEEP = 15;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
};

// Sri Lanka is UTC+5:30 year-round, so the local reading of a timestamp is unambiguous.
const colombo = (d = new Date()) =>
  d.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'short', timeStyle: 'short' });

const log = (m) => console.log(`[backup] ${colombo()} ${m}`);

async function main() {
  const keep = Number(value('--keep') ?? process.env.BACKUP_KEEP ?? DEFAULT_KEEP);
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`--keep expects a positive whole number, got "${keep}"`);

  const { configured, missing } = remote.status();
  if (!configured) {
    // Not an exception: there is nothing to retry and nothing broke. It still means no backup
    // was taken, which is worth an SMS, because otherwise it fails silently every night.
    log(`remote storage is not configured; missing: ${missing.join(', ')}`);
    await alert(`BACKUP NOT CONFIGURED: no nightly backup was taken. Missing settings: ${missing.join(', ')}.`);
    return 2;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const { name, manifest, bytes } = await remote.uploadBackup();
    const records = Object.values(manifest.collections).reduce((sum, n) => sum + n, 0);
    const mb = (bytes / 1024 / 1024).toFixed(1);
    log(`stored ${name} — ${mb} MB, ${records} records, ${manifest.uploads.count} files`);

    if (flag('--no-prune')) {
      log('pruning skipped (--no-prune)');
    } else {
      // Only after the upload above verified its stored size, so a bad night can never
      // trigger the deletion of good copies.
      const { deleted, kept } = await remote.pruneBackups(keep);
      log(`retention: keeping ${kept}, deleted ${deleted} older backup(s)`);
    }
    return 0;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error(`[backup] ${colombo()} FAILED: ${err.message}`);
    // The alert must not be able to mask the original failure, hence the non-zero exit either way.
    await alert(`BACKUP FAILED at ${colombo()}: ${err.message}`);
    process.exit(1);
  });
