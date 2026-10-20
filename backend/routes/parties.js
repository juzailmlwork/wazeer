const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const auth = require('../middleware/auth');

const LEDGERS = ['payable', 'receivable'];

// Money, so two decimals. Summing floats drifts (0.1 + 0.2), and a balance that reads
// 1999.9999999999998 on screen destroys confidence in the whole page.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readLedger(req, res) {
  const ledger = String(req.query.ledger || req.body.ledger || '').trim();
  if (!LEDGERS.includes(ledger)) {
    res.status(400).json({ message: "ledger must be 'payable' or 'receivable'" });
    return null;
  }
  return ledger;
}

// Which column an entry falls in. The single source of truth for the convention described
// in models/LedgerEntry.js.
const sideOf = (ledger, kind) => {
  if (ledger === 'payable') return kind === 'charge' ? 'credit' : 'debit';
  return kind === 'charge' ? 'debit' : 'credit';
};

const shape = (e) => ({
  _id: e._id,
  party: e.party,
  ledger: e.ledger,
  kind: e.kind,
  side: sideOf(e.ledger, e.kind),
  amount: round2(e.amount),
  description: e.description || '',
  entryDate: e.entryDate,
  createdBy: e.createdBy || '',
  createdAt: e.createdAt,
});

// GET /api/parties?ledger=payable&search=foo
// The directory with this ledger's running totals attached, so the list can show each
// person's pending figure without a request per row.
router.get('/', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const search = String(req.query.search || '').trim();
    const filter = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: rx }, { phone: rx }];
    }

    const [parties, totals] = await Promise.all([
      Party.find(filter).sort({ name: 1 }).lean(),
      LedgerEntry.aggregate([
        { $match: { ledger } },
        {
          $group: {
            _id: '$party',
            charges: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amount', 0] } },
            payments: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
            entryCount: { $sum: 1 },
            lastEntryDate: { $max: '$entryDate' },
          },
        },
      ]),
    ]);

    const byParty = new Map(totals.map((t) => [String(t._id), t]));
    const rows = parties.map((p) => {
      const t = byParty.get(String(p._id));
      const charges = round2(t?.charges || 0);
      const payments = round2(t?.payments || 0);
      return {
        ...p,
        charges,
        payments,
        pending: round2(charges - payments),
        entryCount: t?.entryCount || 0,
        lastEntryDate: t?.lastEntryDate || null,
      };
    });

    // Ledger-wide figures come from the aggregation, not from `rows`, so a search does not
    // change the total shown at the top of the tab.
    const allCharges = round2(totals.reduce((s, t) => s + t.charges, 0));
    const allPayments = round2(totals.reduce((s, t) => s + t.payments, 0));

    res.json({
      parties: rows,
      summary: {
        ledger,
        charges: allCharges,
        payments: allPayments,
        pending: round2(allCharges - allPayments),
        partiesWithActivity: totals.length,
        partyCount: await Party.countDocuments(),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!name) return res.status(400).json({ message: 'Name is required' });
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });
    const party = await Party.create({ name, phone });
    res.status(201).json(party);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Someone with that name already exists' });
    }
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Name is required' });
      update.name = name;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ message: 'Phone number is required' });
      update.phone = phone;
    }
    const party = await Party.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!party) return res.status(404).json({ message: 'Person not found' });
    res.json(party);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Someone with that name already exists' });
    }
    res.status(400).json({ message: err.message });
  }
});

// Refuses while any record remains, on either ledger. Removing the person silently would
// take a loan history with it, and a balance that vanishes is the one mistake in a ledger
// nobody can reconstruct afterwards.
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    const entries = await LedgerEntry.countDocuments({ party: req.params.id });
    if (entries > 0) {
      return res.status(400).json({
        message: `This person still has ${entries} record${entries === 1 ? '' : 's'}. Delete the records first.`,
      });
    }
    const party = await Party.findByIdAndDelete(req.params.id);
    if (!party) return res.status(404).json({ message: 'Person not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/parties/:id/entries?ledger=payable
// Oldest first with a running balance, the way a statement is read.
router.get('/:id/entries', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Person not found' });
    }
    const party = await Party.findById(req.params.id).lean();
    if (!party) return res.status(404).json({ message: 'Person not found' });

    const entries = await LedgerEntry.find({ party: party._id, ledger })
      .sort({ entryDate: 1, createdAt: 1 })
      .lean();

    let balance = 0;
    let charges = 0;
    let payments = 0;
    const rows = entries.map((e) => {
      const signed = e.kind === 'charge' ? e.amount : -e.amount;
      balance = round2(balance + signed);
      if (e.kind === 'charge') charges = round2(charges + e.amount);
      else payments = round2(payments + e.amount);
      return { ...shape(e), balance };
    });

    res.json({
      party,
      ledger,
      entries: rows,
      summary: { charges, payments, pending: round2(charges - payments), entryCount: rows.length },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/entries', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const { kind, description } = req.body;
    if (!['charge', 'payment'].includes(kind)) {
      return res.status(400).json({ message: "kind must be 'charge' or 'payment'" });
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Person not found' });
    }
    const party = await Party.findById(req.params.id).lean();
    if (!party) return res.status(404).json({ message: 'Person not found' });

    const entryDate = req.body.entryDate ? new Date(req.body.entryDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const entry = await LedgerEntry.create({
      party: party._id,
      ledger,
      kind,
      amount: round2(amount),
      description: typeof description === 'string' ? description.trim() : '',
      entryDate,
      createdBy: req.user.username,
    });

    res.status(201).json(shape(entry.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id/entries/:entryId', auth, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    if (!mongoose.isValidObjectId(req.params.entryId)) {
      return res.status(404).json({ message: 'Record not found' });
    }
    const entry = await LedgerEntry.findOneAndDelete({
      _id: req.params.entryId,
      party: req.params.id,
    });
    if (!entry) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
