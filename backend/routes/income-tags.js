const express = require('express');
const router = express.Router();
const IncomeTag = require('../models/IncomeTag');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const tags = await IncomeTag.find().sort({ name: 1 });
    res.json(tags);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const tag = new IncomeTag(req.body);
    await tag.save();
    res.status(201).json(tag);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    await IncomeTag.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
