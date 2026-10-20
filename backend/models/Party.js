const mongoose = require('mongoose');

// A person on one ledger. Payable and Receivable keep separate directories: the same name
// on each tab is two independent records with their own balance and history.
//
// Deliberately its own collection rather than a flag on Supplier or Customer — a lender is
// not a vendor, and mixing them would put loan balances into the purchase and sale reports.
const partySchema = new mongoose.Schema(
  {
    ledger: { type: String, enum: ['payable', 'receivable'], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    // Search keys, written beside the display values rather than derived at query time.
    //
    // Searching the display fields would need a case-insensitive regex, which MongoDB
    // cannot serve from an index at all. Matching a pre-lowercased field needs no /i flag,
    // so the planner can walk the index below instead of fetching and lowercasing every
    // document. phoneDigits does the same for numbers, and incidentally makes "077 123"
    // and "0771234567" find the same person.
    nameLower: { type: String, required: true },
    phoneDigits: { type: String, default: '' },
  },
  { timestamps: true }
);

// One index earns three keeps: it scopes every query to its ledger, it returns the
// directory already in alphabetical order so the sort is free, and it stops the same
// person being entered twice under a different capitalisation.
partySchema.index({ ledger: 1, nameLower: 1 }, { unique: true });
partySchema.index({ ledger: 1, phoneDigits: 1 });

// Exported so routes write these the same way on create and on update. A pre-save hook
// would not help: findOneAndUpdate does not run one.
partySchema.statics.normName = (s) => String(s || '').trim().toLowerCase();
partySchema.statics.normPhone = (s) => String(s || '').replace(/\D/g, '');

module.exports = mongoose.model('Party', partySchema);
