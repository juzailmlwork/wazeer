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
    const doc = { ...rest, createdBy: req.user.username };
    if (transactionDate) doc.createdAt = new Date(transactionDate);
    const sale = new Sale(doc);
    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
