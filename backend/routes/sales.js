const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.customer) filter.customer = req.query.customer;
    const sales = await Sale.find(filter)
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { transactionDate, ...rest } = req.body;
    const doc = { ...rest, createdBy: req.user.username, status: req.user.role === 'super_admin' ? 'approved' : 'pending', approvedBy: req.user.role === 'super_admin' ? req.user.username : null };
    if (transactionDate) doc.createdAt = new Date(transactionDate);
    const sale = new Sale(doc);
    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/approve', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can approve' });
  try {
    const doc = await Sale.findByIdAndUpdate(req.params.id, { status: 'approved', approvedBy: req.user.username }, { new: true });
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
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
