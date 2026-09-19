const express = require('express');
const router = express.Router();
const SalaryRecord = require('../models/SalaryRecord');
const { TIME_RE } = SalaryRecord;
const auth = require('../middleware/auth');

const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// End before start means the shift ran past midnight.
function hoursBetween(startTime, endTime) {
  let diff = toMinutes(endTime) - toMinutes(startTime);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.date) {
      // Dates are stored as UTC midnight of the chosen day (new Date('YYYY-MM-DD')).
      const day = new Date(req.query.date);
      if (isNaN(day)) return res.status(400).json({ message: 'Invalid date' });
      filter.date = { $gte: day, $lt: new Date(day.getTime() + 24 * 60 * 60 * 1000) };
    } else if (req.query.month && req.query.year) {
      const year = Number(req.query.year);
      const month = Number(req.query.month); // 0-indexed
      filter.date = {
        $gte: new Date(year, month, 1),
        $lt: new Date(year, month + 1, 1),
      };
    }
    const records = await SalaryRecord.find(filter).sort({ date: -1, startTime: 1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { employeeId, employeeName, date, startTime, endTime, amount, yard } = req.body;
    if (!TIME_RE.test(startTime || '') || !TIME_RE.test(endTime || '')) {
      return res.status(400).json({ message: 'Start and end time are required (HH:mm)' });
    }
    if (startTime === endTime) {
      return res.status(400).json({ message: 'End time must differ from start time' });
    }
    const record = new SalaryRecord({
      employee: employeeId,
      employeeName,
      date: new Date(date),
      startTime,
      endTime,
      hours: hoursBetween(startTime, endTime),
      amount: Number(amount),
      yard,
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
