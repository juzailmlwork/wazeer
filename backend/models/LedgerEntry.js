const mongoose = require('mongoose');

// One line of a party's statement.
//
// `kind` records what happened in plain terms. Which column it lands in follows from that
// and the ledger, so the debit/credit side is never stored and so can never contradict
// itself:
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

    // A copy of the party's ledger. The one piece of denormalisation here, and it pays for
    // itself: the whole-ledger totals shown at the top of the tab become a single index
    // scan instead of a join against the directory. Routes always take it from the party,
    // never from the request, so the copy cannot drift.
    ledger: { type: String, enum: ['payable', 'receivable'], required: true },

    kind: { type: String, enum: ['charge', 'payment'], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    // Separate from createdAt: when the money moved, which is often not when it was typed
    // in. A repayment made on Friday is frequently entered on Monday.
    entryDate: { type: Date, required: true, default: Date.now },
    createdBy: { type: String },
  },
  { timestamps: true }
);

// The totals behind the people list and the tab header. Every field the aggregation reads
// is in the key, so MongoDB answers it from the index alone and never touches a document —
// which matters because this one query covers the entire ledger's history.
ledgerEntrySchema.index({ ledger: 1, party: 1, kind: 1, amount: 1 });

// One person's statement, returned in the order it is displayed so the sort is free.
ledgerEntrySchema.index({ party: 1, entryDate: 1, createdAt: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
