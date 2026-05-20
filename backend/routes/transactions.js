const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.supplier) filter.supplier = req.query.supplier;
    const transactions = await Transaction.find(filter)
      .populate('supplier', 'name phone')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { transactionDate, ...rest } = req.body;
    const doc = { ...rest, createdBy: req.user.username };
    if (transactionDate) doc.createdAt = new Date(transactionDate);
    const transaction = new Transaction(doc);
    await transaction.save();
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
