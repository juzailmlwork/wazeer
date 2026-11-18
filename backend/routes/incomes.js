const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Income = require('../models/Income');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const incomes = await Income.find().populate('tags', 'name color').sort({ createdAt: -1 });
    res.json(incomes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { incomeDate, ...rest } = req.body;
    const doc = { ...rest, createdBy: req.user.username, status: req.user.role === 'super_admin' ? 'approved' : 'pending', approvedBy: req.user.role === 'super_admin' ? req.user.username : null };
    if (incomeDate) doc.createdAt = new Date(incomeDate);
    const income = new Income(doc);
    await income.save();
    const populated = await income.populate('tags', 'name color');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Approves a specific list of records in one call.
//
// Takes explicit ids rather than a filter: the caller approves exactly the rows it showed
// the user and nothing else, so a record added between loading the page and pressing the
// button cannot be swept up in it.
//
// Declared above '/:id/approve' so the literal path is matched before the parameterised
// one can ever treat "approve-many" as an id.
router.patch('/approve-many', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can approve' });
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const valid = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!valid.length) return res.status(400).json({ message: 'No records given to approve' });
    if (valid.length > 500) return res.status(400).json({ message: 'Too many records in one go — narrow the filter first' });

    // Only pending ones move. Re-sending an id that someone else has since approved
    // leaves it alone instead of overwriting who approved it.
    const result = await Income.updateMany(
      { _id: { $in: valid }, status: 'pending' },
      { status: 'approved', approvedBy: req.user.username }
    );
    res.json({ approved: result.modifiedCount, requested: valid.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/approve', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can approve' });
  try {
    const doc = await Income.findByIdAndUpdate(req.params.id, { status: 'approved', approvedBy: req.user.username }, { new: true }).populate('tags', 'name color');
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    await Income.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
