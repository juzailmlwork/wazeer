const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const File = require('../models/File');
const auth = require('../middleware/auth');

const asObjectId = (v) => (v && v !== 'root' && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

// Every folder inside `id`, at any depth — used to stop a folder being moved into itself.
async function descendantIds(id) {
  const all = await Folder.find({}, 'parent').lean();
  const children = new Map();
  for (const f of all) {
    const key = String(f.parent);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(String(f._id));
  }
  const out = [];
  const walk = (parentId) => (children.get(parentId) || []).forEach((c) => { out.push(c); walk(c); });
  walk(String(id));
  return out;
}

router.get('/', auth, async (req, res) => {
  try {
    res.json(await Folder.find().sort({ name: 1 }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Folder name is required' });
    const parent = asObjectId(req.body.parent);
    if (parent && !(await Folder.exists({ _id: parent }))) return res.status(400).json({ message: 'Parent folder no longer exists' });
    const folder = await Folder.create({ name, parent, createdBy: req.user.username });
    res.status(201).json(folder);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A folder with that name already exists here' });
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    if (typeof req.body.name === 'string') {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ message: 'Folder name is required' });
      folder.name = name;
    }
    if (req.body.parent !== undefined) {
      const parent = asObjectId(req.body.parent);
      if (parent) {
        if (String(parent) === String(folder._id)) return res.status(400).json({ message: 'A folder cannot be moved into itself' });
        if (!(await Folder.exists({ _id: parent }))) return res.status(400).json({ message: 'Destination folder no longer exists' });
        if ((await descendantIds(folder._id)).includes(String(parent))) {
          return res.status(400).json({ message: 'A folder cannot be moved into one of its own subfolders' });
        }
      }
      folder.parent = parent;
    }
    await folder.save();
    res.json(folder);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A folder with that name already exists here' });
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can delete' });
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    // Deleting is never recursive: it can't take files with it by surprise.
    const [subfolders, files] = await Promise.all([
      Folder.countDocuments({ parent: folder._id }),
      File.countDocuments({ folder: folder._id }),
    ]);
    if (subfolders || files) {
      const parts = [subfolders && `${subfolders} subfolder${subfolders > 1 ? 's' : ''}`, files && `${files} file${files > 1 ? 's' : ''}`].filter(Boolean);
      return res.status(400).json({ message: `This folder still contains ${parts.join(' and ')}. Empty it first.` });
    }
    await folder.deleteOne();
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
