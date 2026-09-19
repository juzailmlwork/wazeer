const mongoose = require('mongoose');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const salaryRecordSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeName: { type: String, required: true },
    date: { type: Date, required: true },
    // HH:mm, 24h. Optional so records created before times were tracked stay valid.
    startTime: { type: String, match: TIME_RE },
    endTime: { type: String, match: TIME_RE },
    hours: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    createdBy: { type: String },
  },
  { timestamps: true }
);

salaryRecordSchema.index({ employee: 1, date: -1 });
salaryRecordSchema.index({ date: -1 });

module.exports = mongoose.model('SalaryRecord', salaryRecordSchema);
module.exports.TIME_RE = TIME_RE;
