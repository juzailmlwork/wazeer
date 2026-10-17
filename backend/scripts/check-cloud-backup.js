#!/usr/bin/env node
/**
 * Watchdog: alert if the newest backup in remote storage is too old.
 *
 *   node scripts/check-cloud-backup.js                     # alert if older than BACKUP_MAX_AGE_HOURS
 *   node scripts/check-cloud-backup.js --max-age-hours 30
 *   node scripts/check-cloud-backup.js --quiet             # only speak up when something is wrong
 *
 * The nightly job alerts when it fails. This covers what that cannot: cron never firing, the
 * server being down at 23:50, credentials expiring, or the script being deleted. It reads the
 * bucket, so it depends on nothing here except the ability to reach remote storage.
 *
 * Needs no database connection — it only lists the bucket.
 *
 * Exits 1 when the newest backup is stale, missing or unreadable, so it also works as a probe
 * for any external monitor.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const remote = require('../services/s3');
const { alert } = require('../services/alert');

const DEFAULT_MAX_AGE_HOURS = 30; // Enough to catch a single missed night by the next morning.

const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const value = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
};

const colombo = (d = new Date()) =>
  d.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'short', timeStyle: 'short' });

const say = (m) => { if (!quiet) console.log(`[backup-check] ${colombo()} ${m}`); };
const complain = (m) => console.error(`[backup-check] ${colombo()} ${m}`);

(async () => {
  const maxAgeHours = Number(value('--max-age-hours') ?? process.env.BACKUP_MAX_AGE_HOURS ?? DEFAULT_MAX_AGE_HOURS);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    complain(`--max-age-hours expects a positive number, got "${maxAgeHours}"`);
    process.exit(1);
  }

  const { configured, missing } = remote.status();
  if (!configured) {
    complain(`remote storage is not configured; missing: ${missing.join(', ')}`);
    await alert(`BACKUP CHECK: remote storage is not configured, so nothing is being backed up. Missing: ${missing.join(', ')}.`);
    process.exit(1);
  }

  let backups;
  try {
    backups = await remote.listBackups(1);
  } catch (err) {
    // Not being able to read the bucket at all is itself worth waking someone for.
    complain(`could not list remote backups: ${err.message}`);
    await alert(`BACKUP CHECK FAILED: cannot read remote storage (${err.message}).`);
    process.exit(1);
  }

  if (backups.length === 0) {
    complain('no backups found in remote storage');
    await alert('NO BACKUPS FOUND in remote storage. Nothing has been backed up.');
    process.exit(1);
  }

  const newest = backups[0];
  const ageHours = (Date.now() - new Date(newest.lastModified).getTime()) / 3600000;
  const stamp = colombo(new Date(newest.lastModified));

  if (ageHours > maxAgeHours) {
    const msg = `BACKUP STALE: the newest backup is ${ageHours.toFixed(1)}h old (${stamp}), limit ${maxAgeHours}h.`;
    complain(msg);
    const { sent, skipped } = await alert(msg);
    if (sent === 0 && !skipped) complain('the alert itself could not be delivered');
    process.exit(1);
  }

  say(`newest backup is ${ageHours.toFixed(1)}h old (${stamp}) — healthy`);
})().catch(async (err) => {
  complain(`FAILED: ${err.message}`);
  await alert(`BACKUP CHECK FAILED: ${err.message}`);
  process.exit(1);
});
