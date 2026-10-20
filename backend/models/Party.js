const mongoose = require('mongoose');

// A person the business lends to or borrows from. Deliberately its own collection rather
// than a flag on Supplier or Customer: a lender is not a vendor, and mixing them would put
// loan balances into the purchase and sale reports.
//
// One directory serves both ledgers, because the same person can owe you and be owed.
const partySchema = new mongoose.Schema(
  {
    // Unique so the same person cannot end up with two part-balances. Phone is not unique —
    // relatives and a shop and its owner legitimately share one number.
    name: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// Both fields are searched from the Payable and Receivable tabs.
partySchema.index({ phone: 1 });

module.exports = mongoose.model('Party', partySchema);
