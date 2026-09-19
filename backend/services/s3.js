// Upload backups to S3 (or any S3-compatible store via S3_ENDPOINT). Configured entirely by env:
//   S3_BUCKET, S3_REGION (or AWS_REGION), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   optional: S3_PREFIX (default "wazeer-backups/"), S3_ENDPOINT (MinIO, Cloudflare R2, …)
const { PassThrough } = require('stream');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { BackupError, exclusive, writeBackup, backupFilename } = require('./backup');

function config() {
  let prefix = process.env.S3_PREFIX ?? 'wazeer-backups/';
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
    const upload = new Upload({
      client: s3,
      params: { Bucket: bucket, Key: key, Body: body, ContentType: 'application/zip' },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    });
    // If S3 rejects us (bad credentials, missing bucket) nothing drains the stream; destroying it
    // makes writeBackup fail instead of waiting forever.
    const uploaded = upload.done().catch((err) => { body.destroy(err); throw err; });
    const written = writeBackup(body).catch((err) => { upload.abort().catch(() => {}); throw err; });
    try {
      const [manifest] = await Promise.all([written, uploaded]);
      return { name: key.slice(prefix.length), manifest };
    } catch (err) {
      console.error(`[remote-backup] upload of ${key} failed:`, err.name, err.message);
      throw new BackupError('Upload to remote storage failed. The server log has the details.');
    }
  });
}

async function listBackups(limit = 20) {
  const s3 = client();
  const { bucket, prefix } = status();
  const objects = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    objects.push(...(page.Contents || []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects
    .filter((o) => o.Key.endsWith('.zip'))
    .sort((a, b) => b.LastModified - a.LastModified)
    .slice(0, limit)
    .map((o) => ({ name: o.Key.slice(prefix.length), size: o.Size, lastModified: o.LastModified }));
}

module.exports = { status, uploadBackup, listBackups };
