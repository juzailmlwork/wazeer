const express = require('express');
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
    const doc = { ...rest, createdBy: req.user.username };
    if (incomeDate) doc.createdAt = new Date(incomeDate);
    const income = new Income(doc);
    await income.save();
    const populated = await income.populate('tags', 'name color');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
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
