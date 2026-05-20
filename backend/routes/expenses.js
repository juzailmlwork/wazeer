const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const expenses = await Expense.find().populate('tags', 'name color').sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { expenseDate, ...rest } = req.body;
    const doc = { ...rest, createdBy: req.user.username, status: req.user.role === 'super_admin' ? 'approved' : 'pending', approvedBy: req.user.role === 'super_admin' ? req.user.username : null };
    if (expenseDate) doc.createdAt = new Date(expenseDate);
    const expense = new Expense(doc);
    await expense.save();
    const populated = await expense.populate('tags', 'name color');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/approve', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can approve' });
  try {
    const doc = await Expense.findByIdAndUpdate(req.params.id, { status: 'approved', approvedBy: req.user.username }, { new: true }).populate('tags', 'name color');
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
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
