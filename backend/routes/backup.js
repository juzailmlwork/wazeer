const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const auth = require('../middleware/auth');
const backup = require('../services/backup');
// "Remote storage" is S3 underneath; responses deliberately don't reveal the provider or its settings.
const remote = require('../services/s3');
const { BACKUP_DIR } = require('../config/paths');

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Super admin access required' });
  next();
};

function sendError(res, err) {
  if (err instanceof backup.BusyError) return res.status(409).json({ message: err.message });
  if (err instanceof backup.BackupError) return res.status(400).json({ message: err.message });
  console.error('[backup]', err);
  res.status(500).json({ message: err.message });
}

// The download is a plain browser navigation so large zips stream straight to disk instead of
// being buffered in page memory. Navigations can't carry the Authorization header, so an
// authenticated call first mints a short-lived, single-use token for the URL.
const DOWNLOAD_TOKEN_TTL_MS = 60 * 1000;
const downloadTokens = new Map();

router.post('/download-token', auth, superAdminOnly, (req, res) => {
  const now = Date.now();
  for (const [t, exp] of downloadTokens) if (exp < now) downloadTokens.delete(t);
  const token = crypto.randomBytes(24).toString('hex');
  downloadTokens.set(token, now + DOWNLOAD_TOKEN_TTL_MS);
  res.json({ token });
});

router.get('/download', async (req, res) => {
  const expires = downloadTokens.get(req.query.token);
  downloadTokens.delete(req.query.token);
  if (!expires || expires < Date.now()) return res.status(401).json({ message: 'Download link expired. Start the download again.' });

  try {
    await backup.exclusive('backup', async () => {
      res.attachment(backup.backupFilename());
      res.set('Content-Type', 'application/zip');
      await backup.writeBackup(res);
    });
  } catch (err) {
    if (!res.headersSent) return sendError(res, err);
    // Mid-stream: the status is already sent; cutting the connection leaves the browser with a failed download, not a truncated zip.
    console.error('[backup] download aborted:', err.message);
    res.destroy();
  }
});

router.get('/summary', auth, superAdminOnly, async (req, res) => {
  try {
    res.json({ ...(await backup.summary()), remote: { configured: remote.status().configured } });
  } catch (err) {
    sendError(res, err);
  }
});

const incoming = path.join(BACKUP_DIR, 'incoming');
fs.mkdirSync(incoming, { recursive: true });
const upload = multer({
  dest: incoming,
  limits: { fileSize: 5 * 1024 * 1024 * 1024, files: 1 },
});

router.post('/restore', auth, superAdminOnly, (req, res) => {
  upload.single('backup')(req, res, async (uploadErr) => {
    const file = req.file;
    try {
      if (uploadErr) throw new backup.BackupError(uploadErr.message);
      if (!file) throw new backup.BackupError('Choose a backup .zip file to restore');
      const result = await backup.restoreBackup(file.path);
      res.json({
        message: 'Restore complete',
        backupCreatedAt: result.manifest.createdAt,
        collections: result.manifest.collections,
        uploads: result.manifest.uploads,
        safetySnapshot: result.safetySnapshot,
      });
    } catch (err) {
      sendError(res, err);
    } finally {
      if (file) fs.promises.rm(file.path, { force: true });
    }
  });
});

router.get('/remote', auth, superAdminOnly, async (req, res) => {
  const { configured } = remote.status();
  if (!configured) return res.json({ configured, backups: [] });
  try {
    res.json({ configured, backups: await remote.listBackups() });
  } catch (err) {
    console.error('[remote-backup] listing failed:', err.name, err.message);
    res.json({ configured, backups: [], error: 'Could not load the list of stored backups. The server log has the details.' });
  }
});

router.post('/remote', auth, superAdminOnly, async (req, res) => {
  try {
    const { name, manifest } = await remote.uploadBackup();
    res.status(201).json({ name, collections: manifest.collections, uploads: manifest.uploads });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
