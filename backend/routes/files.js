const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const File = require('../models/File');
const auth = require('../middleware/auth');

const { UPLOAD_DIR } = require('../config/paths');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// SVG is deliberately excluded: it can carry script and we serve files inline.
const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXTENSIONS[file.mimetype]),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) return cb(null, true);
    cb(new Error(`${file.originalname} is not a JPG, PNG, WEBP or GIF image`));
  },
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripExt = (name) => name.replace(/\.[^.]+$/, '');

function parseTags(raw) {
  let tags = raw;
  if (typeof raw === 'string') {
    try { tags = JSON.parse(raw); } catch { tags = []; }
  }
  if (!Array.isArray(tags)) return [];
  return tags.filter((id) => mongoose.isValidObjectId(id));
}

const removeFromDisk = (storedName) =>
  fs.promises.unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.search) filter.name = { $regex: escapeRegex(req.query.search.trim()), $options: 'i' };
    if (req.query.tag && mongoose.isValidObjectId(req.query.tag)) filter.tags = req.query.tag;
    const files = await File.find(filter).populate('tags').sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, (req, res) => {
  upload.array('files')(req, res, async (uploadErr) => {
    const uploaded = req.files || [];
    if (uploadErr) {
      await Promise.all(uploaded.map((f) => removeFromDisk(f.filename)));
      const message = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 15 MB or smaller'
        : uploadErr.code === 'LIMIT_FILE_COUNT' ? 'You can upload up to 20 images at a time'
        : uploadErr.message;
      return res.status(400).json({ message });
    }
    if (uploaded.length === 0) return res.status(400).json({ message: 'No images uploaded' });

    try {
      const tags = parseTags(req.body.tags);
      // A custom name only makes sense for a single image; batches keep their filenames.
      const customName = uploaded.length === 1 ? (req.body.name || '').trim() : '';
      const docs = await File.insertMany(uploaded.map((f) => ({
        name: customName || stripExt(f.originalname),
        originalName: f.originalname,
        storedName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
        tags,
        createdBy: req.user.username,
      })));
      const populated = await File.find({ _id: { $in: docs.map((d) => d._id) } }).populate('tags').sort({ createdAt: -1 });
      res.status(201).json(populated);
    } catch (err) {
      await Promise.all(uploaded.map((f) => removeFromDisk(f.filename)));
      res.status(400).json({ message: err.message });
    }
  });
});

router.get('/:id/content', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    res.set({
      'Content-Type': file.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400',
    });
    if (req.query.download) res.attachment(file.originalName);
    res.sendFile(path.join(UPLOAD_DIR, file.storedName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'File missing on disk' });
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.name === 'string') {
      if (!req.body.name.trim()) return res.status(400).json({ message: 'Name is required' });
      update.name = req.body.name.trim();
    }
    if (req.body.tags !== undefined) update.tags = parseTags(req.body.tags);
    const file = await File.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate('tags');
    if (!file) return res.status(404).json({ message: 'File not found' });
    res.json(file);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    const file = await File.findByIdAndDelete(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    await removeFromDisk(file.storedName);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
