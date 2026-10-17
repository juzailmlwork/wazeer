// Upload backups to S3 (or any S3-compatible store via S3_ENDPOINT). Configured entirely by env:
//   S3_BUCKET, S3_REGION (or AWS_REGION), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   optional: S3_PREFIX (default "wazeer-backup/"), S3_ENDPOINT (MinIO, Cloudflare R2, …)
const { PassThrough } = require('stream');
const { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { BackupError, exclusive, writeBackup, backupFilename } = require('./backup');

function config() {
  let prefix = process.env.S3_PREFIX ?? 'wazeer-backup/';
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return {
    bucket: process.env.S3_BUCKET || null,
    region: process.env.S3_REGION || process.env.AWS_REGION || null,
    endpoint: process.env.S3_ENDPOINT || null,
    prefix,
    hasCredentials: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
  };
}

function status() {
  const c = config();
  const missing = [
    !c.bucket && 'S3_BUCKET',
    !c.region && 'S3_REGION',
    !process.env.AWS_ACCESS_KEY_ID && 'AWS_ACCESS_KEY_ID',
    !process.env.AWS_SECRET_ACCESS_KEY && 'AWS_SECRET_ACCESS_KEY',
  ].filter(Boolean);
  // Never report the credentials themselves.
  return { configured: missing.length === 0, missing, bucket: c.bucket, region: c.region, prefix: c.prefix, endpoint: c.endpoint };
}

function client() {
  const s = status();
  if (!s.configured) {
    console.error(`[remote-backup] S3 not configured; missing env: ${s.missing.join(', ')}`);
    throw new BackupError('Remote storage is not set up yet');
  }
  return new S3Client({ region: s.region, ...(s.endpoint && { endpoint: s.endpoint, forcePathStyle: true }) });
}

async function uploadBackup() {
  const s3 = client();
  const { bucket, prefix } = status();
  const key = `${prefix}${backupFilename()}`;
  return exclusive('backup', async () => {
    const body = new PassThrough();
    // The zip is counted as it is produced, so the stored object can be checked against what
    // was actually written. A multipart upload that lands short otherwise looks like a success,
    // and pruning would then trust it enough to delete older copies.
    let bytes = 0;
    const counted = new PassThrough();
    counted.on('data', (chunk) => { bytes += chunk.length; });
    counted.pipe(body);

    const upload = new Upload({
      client: s3,
      params: { Bucket: bucket, Key: key, Body: body, ContentType: 'application/zip' },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    });
    // If S3 rejects us (bad credentials, missing bucket) nothing drains the stream; destroying
    // both ends makes writeBackup fail instead of waiting forever. `.pipe()` does not forward a
    // destroy upstream, so `counted` has to be destroyed explicitly or writeBackup never settles.
    const uploaded = upload.done().catch((err) => { counted.destroy(err); body.destroy(err); throw err; });
    const written = writeBackup(counted).catch((err) => { upload.abort().catch(() => {}); throw err; });
    try {
      const [manifest] = await Promise.all([written, uploaded]);
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (head.ContentLength !== bytes) {
        throw new Error(`wrote ${bytes} bytes but remote storage holds ${head.ContentLength}`);
      }
      return { name: key.slice(prefix.length), manifest, bytes };
    } catch (err) {
      console.error(`[remote-backup] upload of ${key} failed:`, err.name, err.message);
      throw new BackupError('Upload to remote storage failed. The server log has the details.');
    }
  });
}

// Every stored backup under the prefix, newest first.
async function listAll(s3, bucket, prefix) {
  const objects = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    objects.push(...(page.Contents || []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects
    .filter((o) => o.Key.endsWith('.zip'))
    .sort((a, b) => b.LastModified - a.LastModified);
}

async function listBackups(limit = 20) {
  const s3 = client();
  const { bucket, prefix } = status();
  return (await listAll(s3, bucket, prefix))
    .slice(0, limit)
    .map((o) => ({ name: o.Key.slice(prefix.length), size: o.Size, lastModified: o.LastModified }));
}

// Keep the newest `keep` backups and delete the rest.
//
// Retention is by count, not by age, and deliberately so: an age rule cannot tell a healthy
// rotating bucket from one where the backup has been failing all week. In the second case it
// deletes the last good copies on schedule and leaves nothing. By count, a run of failures
// simply means nothing new arrives and the existing copies stay put.
//
// Call this only after an upload has been verified — see uploadBackup.
async function pruneBackups(keep) {
  if (!Number.isInteger(keep) || keep < 1) throw new BackupError('keep must be a positive whole number');
  const s3 = client();
  const { bucket, prefix } = status();
  const all = await listAll(s3, bucket, prefix);
  const stale = all.slice(keep);
  if (stale.length === 0) return { deleted: 0, kept: all.length };

  // DeleteObjects takes at most 1000 keys per request.
  for (let i = 0; i < stale.length; i += 1000) {
    const chunk = stale.slice(i, i + 1000);
    const res = await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: chunk.map((o) => ({ Key: o.Key })), Quiet: true },
    }));
    if (res.Errors?.length) {
      const first = res.Errors[0];
      throw new Error(`${res.Errors.length} old backup(s) could not be deleted, first ${first.Key}: ${first.Code}`);
    }
  }
  return { deleted: stale.length, kept: all.length - stale.length };
}

module.exports = { status, uploadBackup, listBackups, pruneBackups };
