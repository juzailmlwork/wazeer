// Backup format (a zip):
//   manifest.json            { app, formatVersion, createdAt, database, collections: {name: count}, uploads: {count, bytes} }
//   db/<collection>.ndjson   one document per line, canonical Extended JSON (keeps ObjectId, Date, number types)
//   uploads/<storedName>     every file in UPLOAD_DIR
// Restore replaces all data. It validates the whole zip before touching anything, takes a
// safety snapshot of the current state, and rolls back to that snapshot if applying fails.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const readline = require('readline');
const { once } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const archiver = require('archiver');
const yauzl = require('yauzl');
const mongoose = require('mongoose');
const { UPLOAD_DIR, BACKUP_DIR } = require('../config/paths');

const { EJSON } = mongoose.mongo.BSON;

const APP = 'wazeer';
const FORMAT_VERSION = 1;
// Collection and upload names inside the zip: no slashes and not all dots, so nothing can escape its folder.
const SAFE_NAME = /^(?!\.+$)[A-Za-z0-9_.-]+$/;
const INSERT_BATCH = 500;
const MAX_UPLOAD_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const KEEP_SAFETY_SNAPSHOTS = 5;

// Problems with the backup file itself — reported to the user as a 400.
class BackupError extends Error {}
// Another backup/restore holds the lock — reported as a 409.
class BusyError extends Error {}

let running = null;
async function exclusive(label, fn) {
  if (running) throw new BusyError(`A ${running} is already in progress. Try again when it finishes.`);
  running = label;
  try {
    return await fn();
  } finally {
    running = null;
  }
}

async function listCollections() {
  const cols = await mongoose.connection.db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
  return cols.map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
}

async function listUploads() {
  const entries = await fsp.readdir(UPLOAD_DIR, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const e of entries) {
    if (!e.isFile() || !SAFE_NAME.test(e.name)) continue;
    const { size } = await fsp.stat(path.join(UPLOAD_DIR, e.name));
    files.push({ name: e.name, size });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function summary() {
  const db = mongoose.connection.db;
  const collections = {};
  for (const name of await listCollections()) collections[name] = await db.collection(name).estimatedDocumentCount();
  const files = await listUploads();
  return { collections, uploads: { count: files.length, bytes: files.reduce((s, f) => s + f.size, 0) } };
}

// Streams a backup zip into `output`. Every wait races a failure signal: archiver's own
// finalize() never settles if the destination stops reading (client disconnect, failed S3
// upload), and a hung backup would hold the lock forever.
async function writeBackup(output) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const failure = new Promise((_, reject) => {
    archive.on('error', reject);
    archive.on('warning', reject);
    output.on('error', reject);
    output.on('close', () => {
      if (!output.writableFinished) reject(new Error('Backup destination closed before the backup finished'));
    });
  });
  failure.catch(() => {});
  const step = (p) => Promise.race([p, failure]);
  const addEntry = async (source, name) => {
    const processed = once(archive, 'entry');
    archive.append(source, { name });
    await step(processed);
  };

  archive.pipe(output);
  try {
    const db = mongoose.connection.db;
    const manifest = {
      app: APP,
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      database: db.databaseName,
      collections: {},
      uploads: { count: 0, bytes: 0 },
    };

    for (const name of await listCollections()) {
      let count = 0;
      const cursor = db.collection(name).find({}, { sort: { _id: 1 } });
      const lines = Readable.from((async function* () {
        for await (const doc of cursor) {
          count++;
          yield EJSON.stringify(doc, { relaxed: false }) + '\n';
        }
      })());
      await addEntry(lines, `db/${name}.ndjson`);
      manifest.collections[name] = count;
    }

    for (const file of await listUploads()) {
      await addEntry(fs.createReadStream(path.join(UPLOAD_DIR, file.name)), `uploads/${file.name}`);
      manifest.uploads.count++;
      manifest.uploads.bytes += file.size;
    }

    await addEntry(JSON.stringify(manifest, null, 2), 'manifest.json');
    await step(archive.finalize());
    return manifest;
  } catch (err) {
    archive.abort();
    throw err;
  }
}

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = (label = 'wazeer-backup') => `${label}-${timestamp()}.zip`;

async function writeBackupFile(label) {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, backupFilename(label));
  const out = fs.createWriteStream(file);
  const closed = once(out, 'close');
  try {
    const manifest = await writeBackup(out);
    await closed;
    return { path: file, manifest };
  } catch (err) {
    out.destroy();
    await fsp.rm(file, { force: true });
    throw err;
  }
}

async function pruneSafetySnapshots() {
  const names = (await fsp.readdir(BACKUP_DIR).catch(() => []))
    .filter((n) => n.startsWith('pre-restore-') && n.endsWith('.zip'))
    .sort();
  for (const n of names.slice(0, -KEEP_SAFETY_SNAPSHOTS)) await fsp.rm(path.join(BACKUP_DIR, n), { force: true });
}

// ---- reading zips ----

function classify(fileName) {
  if (fileName === 'manifest.json') return { type: 'manifest' };
  if (fileName === 'db/' || fileName === 'uploads/') return { type: 'dir' };
  let m = fileName.match(/^db\/(.+)\.ndjson$/);
  if (m && SAFE_NAME.test(m[1]) && !m[1].startsWith('system.')) return { type: 'collection', name: m[1] };
  m = fileName.match(/^uploads\/(.+)$/);
  if (m && SAFE_NAME.test(m[1])) return { type: 'upload', name: m[1] };
  throw new BackupError(`Unexpected entry in backup: ${fileName}`);
}

// Walks entries one at a time; `fn` gets the entry and an opener for its content.
async function forEachEntry(zipPath, fn) {
  let zip;
  try {
    zip = await new Promise((resolve, reject) =>
      yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, z) => (err ? reject(err) : resolve(z))));
  } catch (err) {
    throw new BackupError(`Not a valid zip file (${err.message})`);
  }
  const open = (entry) => new Promise((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))));
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', (err) => reject(new BackupError(`Backup zip is damaged (${err.message})`)));
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        Promise.resolve()
          .then(() => fn(entry, classify(entry.fileName), () => open(entry)))
          .then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

const lineReader = (stream) => readline.createInterface({ input: stream, crlfDelay: Infinity });

async function readSmall(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw new BackupError('manifest.json is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Reads the whole zip without touching the database. Throws BackupError on anything off.
async function inspectBackup(zipPath) {
  let manifest = null;
  const counts = {};
  let uploads = 0;

  await forEachEntry(zipPath, async (entry, kind, open) => {
    if (kind.type === 'manifest') {
      try {
        manifest = JSON.parse(await readSmall(await open(), MAX_MANIFEST_BYTES));
      } catch (err) {
        throw err instanceof BackupError ? err : new BackupError('manifest.json is not valid JSON');
      }
    } else if (kind.type === 'collection') {
      let n = 0;
      for await (const line of lineReader(await open())) {
        if (!line.trim()) continue;
        try {
          EJSON.parse(line, { relaxed: false });
        } catch {
          throw new BackupError(`Record ${n + 1} in "${kind.name}" is corrupt`);
        }
        n++;
      }
      counts[kind.name] = n;
    } else if (kind.type === 'upload') {
      if (entry.uncompressedSize > MAX_UPLOAD_ENTRY_BYTES) throw new BackupError(`uploads/${kind.name} is unreasonably large`);
      uploads++;
    }
  });

  if (!manifest || manifest.app !== APP) throw new BackupError('This is not a Wazeer backup (manifest.json is missing or from another app)');
  if (manifest.formatVersion !== FORMAT_VERSION) throw new BackupError(`Unsupported backup format version ${manifest.formatVersion}`);
  const expected = manifest.collections || {};
  for (const [name, count] of Object.entries(expected)) {
    if (counts[name] !== count) throw new BackupError(`Backup is incomplete: "${name}" has ${counts[name] ?? 0} of ${count} records`);
  }
  for (const name of Object.keys(counts)) {
    if (!(name in expected)) throw new BackupError(`Backup contains "${name}", which its manifest does not list`);
  }
  if (uploads !== (manifest.uploads?.count ?? 0)) {
    throw new BackupError(`Backup is incomplete: ${uploads} of ${manifest.uploads?.count ?? 0} uploaded files present`);
  }
  return manifest;
}

// Replaces all data with the zip's contents. Assumes inspectBackup() already passed.
async function applyBackup(zipPath) {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const staging = await fsp.mkdtemp(path.join(path.dirname(UPLOAD_DIR), '.uploads-restore-'));
  try {
    // Files first: a failure here leaves the database untouched.
    await forEachEntry(zipPath, async (entry, kind, open) => {
      if (kind.type === 'upload') await pipeline(await open(), fs.createWriteStream(path.join(staging, kind.name)));
    });

    // deleteMany rather than drop, so existing indexes (e.g. unique usernames) stay in force during the insert.
    const db = mongoose.connection.db;
    for (const name of await listCollections()) await db.collection(name).deleteMany({});
    await forEachEntry(zipPath, async (entry, kind, open) => {
      if (kind.type !== 'collection') return;
      const coll = db.collection(kind.name);
      let batch = [];
      for await (const line of lineReader(await open())) {
        if (!line.trim()) continue;
        batch.push(EJSON.parse(line, { relaxed: false }));
        if (batch.length >= INSERT_BATCH) { await coll.insertMany(batch, { ordered: true }); batch = []; }
      }
      if (batch.length) await coll.insertMany(batch, { ordered: true });
    });
    // Collections the backup created from scratch have no indexes yet; this also catches
    // data that violates a unique index, which fails the restore and triggers rollback.
    for (const name of mongoose.modelNames()) await mongoose.model(name).createIndexes();

    for (const f of await fsp.readdir(UPLOAD_DIR)) await fsp.rm(path.join(UPLOAD_DIR, f), { recursive: true, force: true });
    for (const f of await fsp.readdir(staging)) await fsp.rename(path.join(staging, f), path.join(UPLOAD_DIR, f));
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

async function restoreBackup(zipPath) {
  return exclusive('restore', async () => {
    const manifest = await inspectBackup(zipPath);
    const safety = await writeBackupFile('pre-restore');
    try {
      await applyBackup(zipPath);
    } catch (err) {
      try {
        await applyBackup(safety.path);
      } catch (rollbackErr) {
        throw new Error(`Restore failed (${err.message}) and the automatic rollback also failed (${rollbackErr.message}). `
          + `Your data from before the restore is saved on the server at ${safety.path}`);
      }
      throw new BackupError(`Restore failed, so your data was put back exactly as it was. Reason: ${err.message}`);
    }
    await pruneSafetySnapshots();
    return { manifest, safetySnapshot: path.basename(safety.path) };
  });
}

module.exports = {
  BackupError,
  BusyError,
  exclusive,
  summary,
  writeBackup,
  backupFilename,
  inspectBackup,
  restoreBackup,
};
