const express = require('express');
const router = express.Router();
const ClosingStock = require('../models/ClosingStock');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.month !== undefined) filter.month = Number(req.query.month);
    if (req.query.year !== undefined) filter.year = Number(req.query.year);
    res.json(await ClosingStock.find(filter));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can set closing stock' });
  }
  try {
    const { materialName, month, year, value } = req.body;
    const record = await ClosingStock.findOneAndUpdate(
      { materialName, month: Number(month), year: Number(year) },
      { value: Number(value), setBy: req.user.username },
      { upsert: true, new: true }
    );
    res.json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
