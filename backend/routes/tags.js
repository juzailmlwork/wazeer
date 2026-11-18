const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Tag = require('../models/Tag');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    res.json(tags);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const tag = new Tag(req.body);
    await tag.save();
    res.status(201).json(tag);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Deleting a tag that records still point at would leave those references dangling: the
// expenses keep an id that resolves to nothing, so they quietly lose the label they
// were filed under and can no longer be found by it. Nothing here cascades, and there is
// no undo, so an in-use tag is refused outright and the count is reported back.
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid tag id' });
  }
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ message: 'Tag not found' });

    const inUse = await Expense.countDocuments({ tags: tag._id });
    if (inUse > 0) {
      return res.status(400).json({
        message: `"${tag.name}" is used by ${inUse} expense${inUse === 1 ? '' : 's'}. Remove the tag from those records first, or rename it instead.`,
      });
    }

    await Tag.findByIdAndDelete(tag._id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
