const mongoose = require('mongoose');

// One line of a party's statement.
//
// `kind` records what happened in plain terms and `ledger` says which book it belongs to.
// Which column it lands in follows from the pair, so the debit/credit side is never stored
// and so can never contradict itself:
//
//   payable    + charge  -> credit   (we owe more; a liability rises on the credit side)
//   payable    + payment -> debit    (we paid some back)
//   receivable + charge  -> debit    (they owe us more; an asset rises on the debit side)
//   receivable + payment -> credit   (they paid some back)
//
// Outstanding balance is charges - payments either way, so it reads as a positive "pending"
// on both tabs.
const ledgerEntrySchema = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    ledger: { type: String, enum: ['payable', 'receivable'], required: true },
    kind: { type: String, enum: ['charge', 'payment'], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    // Separate from createdAt: when the money moved, which is often not when it was typed in.
    entryDate: { type: Date, required: true, default: Date.now },
    createdBy: { type: String },
  },
  { timestamps: true }
);

// Serves both the per-party statement and the per-ledger totals.
ledgerEntrySchema.index({ party: 1, ledger: 1, entryDate: 1 });
ledgerEntrySchema.index({ ledger: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
