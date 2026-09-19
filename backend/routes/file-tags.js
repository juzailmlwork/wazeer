const express = require('express');
const router = express.Router();
const FileTag = require('../models/FileTag');
const File = require('../models/File');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const tags = await FileTag.find().sort({ name: 1 });
    res.json(tags);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const tag = new FileTag({ name: req.body.name, color: req.body.color });
    await tag.save();
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Tag already exists' });
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    await FileTag.findByIdAndDelete(req.params.id);
    await File.updateMany({ tags: req.params.id }, { $pull: { tags: req.params.id } });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
