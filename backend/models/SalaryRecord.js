const mongoose = require('mongoose');

const salaryRecordSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeName: { type: String, required: true },
    date: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    createdBy: { type: String },
  },
  { timestamps: true }
);

salaryRecordSchema.index({ employee: 1, date: -1 });

module.exports = mongoose.model('SalaryRecord', salaryRecordSchema);
