const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
