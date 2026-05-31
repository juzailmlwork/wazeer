const express = require('express');
const router = express.Router();
const SalaryRecord = require('../models/SalaryRecord');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.month && req.query.year) {
      const year = Number(req.query.year);
      const month = Number(req.query.month); // 0-indexed
      filter.date = {
        $gte: new Date(year, month, 1),
        $lt: new Date(year, month + 1, 1),
      };
    }
    const records = await SalaryRecord.find(filter).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { employeeId, employeeName, date, hours, amount } = req.body;
    const record = new SalaryRecord({
      employee: employeeId,
      employeeName,
      date: new Date(date),
      hours: Number(hours),
      amount: Number(amount),
      createdBy: req.user.username,
    });
    await record.save();
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    await SalaryRecord.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
